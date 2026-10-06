import Fastify, { type FastifyServerOptions } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';
import type Database from 'better-sqlite3';
import { BookingService } from './booking-service.js';
import { openDatabase } from './database.js';
import { ApiError } from './errors.js';
import { OutboxWorker, type MailSender } from './email-worker.js';

const Id = Type.String({ minLength: 1 });
const Email = Type.String({ format: 'email', minLength: 3, maxLength: 254 });
const UtcInstant = Type.String({ format: 'date-time' });
const SlotSchema = Type.Object({
  slotId: Type.String(),
  startAt: UtcInstant,
  endAt: UtcInstant,
  timeZone: Type.String(),
});
const ErrorDetailSchema = Type.Object({ field: Type.String(), message: Type.String() });

export interface AppOptions {
  databasePath?: string;
  database?: Database.Database;
  now?: () => number;
  mailSender?: MailSender;
  startOutboxWorker?: boolean;
  logger?: FastifyServerOptions['logger'];
}

export function buildApp(options: AppOptions = {}) {
  const database = options.database ?? openDatabase(options.databasePath ?? process.env.DATABASE_PATH ?? './data/meeting-booking.sqlite');
  const ownsDatabase = !options.database;
  const now = options.now ?? Date.now;
  const service = new BookingService(database, now);
  const app = Fastify({
    logger: options.logger ?? {
      level: 'info',
      redact: [
        'req.headers.authorization',
        'req.headers.x-cancellation-credential',
        'req.body.holdCredential',
        'req.body.cancellationCredential',
      ],
    },
  }).withTypeProvider<TypeBoxTypeProvider>();
  const outboxWorker = options.mailSender
    ? new OutboxWorker(database, options.mailSender, now, (notificationId, error) => {
        app.log.warn({ notificationId, errorName: error instanceof Error ? error.name : 'Error' }, 'Notification delivery failed; it will be retried');
      })
    : undefined;

  if (outboxWorker && options.startOutboxWorker !== false) outboxWorker.start();

  app.setErrorHandler((error, request, reply) => {
    const validationError = error as Error & {
      validation?: Array<{ instancePath?: string; dataPath?: string; message?: string }>;
      validationContext?: string;
    };
    if (validationError.validation && validationError.validationContext !== 'response') {
      const details = validationError.validation.map((entry) => ({
        field: entry.instancePath || entry.dataPath || 'request',
        message: entry.message ?? 'Invalid value.',
      }));
      return reply.code(400).send(errorResponse('INVALID_REQUEST', 'The request is invalid.', request.id, details));
    }

    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(
        errorResponse(error.code, error.message, request.id, error.details),
      );
    }

    const requestFailure = error as Error & { statusCode?: number };
    if (typeof requestFailure.statusCode === 'number' && requestFailure.statusCode >= 400 && requestFailure.statusCode < 500) {
      return reply.code(400).send(errorResponse('INVALID_REQUEST', 'The request could not be parsed.', request.id));
    }

    request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
    return reply.code(500).send(errorResponse('INTERNAL_ERROR', 'An internal error occurred.', request.id));
  });

  app.addHook('onClose', async () => {
    await outboxWorker?.close();
    if (ownsDatabase) database.close();
  });

  app.get('/health', {
    schema: {
      response: {
        200: Type.Object({ status: Type.Literal('ok') }),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async () => {
    database.prepare('SELECT 1').get();
    return { status: 'ok' as const };
  });

  app.post('/v1/organizers', {
    schema: {
      body: Type.Object({ organizerEmail: Email }),
      response: {
        201: Type.Object({ organizerId: Id, managementKey: Type.String() }),
        400: errorSchema(['INVALID_REQUEST']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    const organizer = service.createOrganizer(request.body.organizerEmail);
    outboxWorker?.kick();
    return reply.code(201).send(organizer);
  });

  app.get('/v1/organizers/me', {
    schema: {
      response: {
        200: Type.Object({ organizerId: Id }),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request) => ({
    organizerId: service.resolveOrganizerId(parseBearer(request.headers.authorization)),
  }));

  app.get('/v1/public/organizers/:organizerId/availability', {
    schema: {
      params: Type.Object({ organizerId: Id }),
      response: {
        200: Type.Object({ organizerId: Id, slots: Type.Array(SlotSchema) }),
        404: errorSchema(['ORGANIZER_NOT_FOUND']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request) => ({
    organizerId: request.params.organizerId,
    slots: service.getPublicAvailability(request.params.organizerId),
  }));

  app.post('/v1/public/organizers/:organizerId/holds', {
    schema: {
      params: Type.Object({ organizerId: Id }),
      body: Type.Object({ slotId: Id }),
      response: {
        201: Type.Object({
          hold: Type.Object({
            holdId: Id,
            holdCredential: Type.String(),
            slot: SlotSchema,
            expiresAt: UtcInstant,
          }),
        }),
        400: errorSchema(['INVALID_REQUEST']),
        404: errorSchema(['ORGANIZER_NOT_FOUND', 'SLOT_NOT_FOUND']),
        409: errorSchema(['SLOT_UNAVAILABLE', 'SLOT_ALREADY_BOOKED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    const hold = service.createHold(request.params.organizerId, request.body.slotId);
    return reply.code(201).send({ hold });
  });

  app.post('/v1/public/holds/:holdId/confirmation', {
    schema: {
      params: Type.Object({ holdId: Id }),
      body: Type.Object({ holdCredential: Type.String({ minLength: 1 }), clientEmail: Email }),
      response: {
        201: Type.Object({ booking: clientBookingSchema() }),
        400: errorSchema(['INVALID_REQUEST']),
        401: errorSchema(['HOLD_CREDENTIAL_INVALID']),
        404: errorSchema(['HOLD_NOT_FOUND']),
        409: errorSchema(['SLOT_UNAVAILABLE', 'SLOT_ALREADY_BOOKED']),
        410: errorSchema(['HOLD_EXPIRED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    const booking = service.confirmHold(request.params.holdId, request.body.holdCredential, request.body.clientEmail);
    outboxWorker?.kick();
    return reply.code(201).send({ booking });
  });

  app.post('/v1/public/bookings/:bookingId/cancellation', {
    schema: {
      params: Type.Object({ bookingId: Id }),
      response: {
        200: Type.Object({ booking: clientBookingSchema() }),
        401: errorSchema(['CANCELLATION_CREDENTIAL_INVALID']),
        404: errorSchema(['BOOKING_NOT_FOUND']),
        409: errorSchema(['BOOKING_ALREADY_CANCELLED']),
        422: errorSchema(['CANCELLATION_WINDOW_CLOSED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    const headerCredential = request.headers['x-cancellation-credential'];
    const credential = Array.isArray(headerCredential) ? headerCredential[0] : headerCredential;
    const booking = service.cancelAsClient(request.params.bookingId, credential);
    outboxWorker?.kick();
    return reply.code(200).send({ booking });
  });

  app.post('/v1/public/bookings/cancellation', {
    schema: {
      response: {
        200: Type.Object({ booking: clientBookingSchema() }),
        401: errorSchema(['CANCELLATION_CREDENTIAL_INVALID']),
        409: errorSchema(['BOOKING_ALREADY_CANCELLED']),
        422: errorSchema(['CANCELLATION_WINDOW_CLOSED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    const headerCredential = request.headers['x-cancellation-credential'];
    const credential = Array.isArray(headerCredential) ? headerCredential[0] : headerCredential;
    const booking = service.cancelWithCredential(credential);
    outboxWorker?.kick();
    return reply.code(200).send({ booking });
  });

  app.post('/v1/organizers/:organizerId/slots', {
    schema: {
      params: Type.Object({ organizerId: Id }),
      body: Type.Object({ startAt: UtcInstant, durationMinutes: Type.Integer({ minimum: 1 }), timeZone: Type.String({ minLength: 1 }) }),
      response: {
        201: Type.Object({ slot: SlotSchema }),
        400: errorSchema(['INVALID_REQUEST']),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        403: errorSchema(['ORGANIZER_ACCESS_DENIED']),
        404: errorSchema(['ORGANIZER_NOT_FOUND']),
        409: errorSchema(['SLOT_OVERLAP']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    service.authorizeOrganizer(request.params.organizerId, parseBearer(request.headers.authorization));
    const slot = service.createSlot(request.params.organizerId, request.body);
    return reply.code(201).send({ slot });
  });

  app.get('/v1/organizers/:organizerId/slots', {
    schema: {
      params: Type.Object({ organizerId: Id }),
      response: {
        200: Type.Object({
          slots: Type.Array(Type.Intersect([
            SlotSchema,
            Type.Object({ state: Type.Union([Type.Literal('available'), Type.Literal('held'), Type.Literal('booked')]), holdExpiresAt: Type.Optional(UtcInstant) }),
          ])),
        }),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        403: errorSchema(['ORGANIZER_ACCESS_DENIED']),
        404: errorSchema(['ORGANIZER_NOT_FOUND']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request) => {
    service.authorizeOrganizer(request.params.organizerId, parseBearer(request.headers.authorization));
    return { slots: service.listOrganizerSlots(request.params.organizerId) };
  });

  app.delete('/v1/organizers/:organizerId/slots/:slotId', {
    schema: {
      params: Type.Object({ organizerId: Id, slotId: Id }),
      response: {
        204: Type.Null(),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        403: errorSchema(['ORGANIZER_ACCESS_DENIED']),
        404: errorSchema(['SLOT_NOT_FOUND']),
        409: errorSchema(['SLOT_ALREADY_BOOKED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request, reply) => {
    service.authorizeOrganizer(request.params.organizerId, parseBearer(request.headers.authorization));
    service.removeSlot(request.params.organizerId, request.params.slotId);
    return reply.code(204).send(null);
  });

  app.get('/v1/organizers/:organizerId/bookings', {
    schema: {
      params: Type.Object({ organizerId: Id }),
      response: {
        200: Type.Object({ bookings: Type.Array(organizerBookingSchema()) }),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        403: errorSchema(['ORGANIZER_ACCESS_DENIED']),
        404: errorSchema(['ORGANIZER_NOT_FOUND']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request) => {
    service.authorizeOrganizer(request.params.organizerId, parseBearer(request.headers.authorization));
    return { bookings: service.listOrganizerBookings(request.params.organizerId) };
  });

  app.post('/v1/organizers/:organizerId/bookings/:bookingId/cancellation', {
    schema: {
      params: Type.Object({ organizerId: Id, bookingId: Id }),
      response: {
        200: Type.Object({ booking: organizerBookingSchema() }),
        401: errorSchema(['ORGANIZER_KEY_INVALID']),
        403: errorSchema(['ORGANIZER_ACCESS_DENIED']),
        404: errorSchema(['BOOKING_NOT_FOUND']),
        409: errorSchema(['BOOKING_ALREADY_CANCELLED']),
        422: errorSchema(['CANCELLATION_WINDOW_CLOSED']),
        500: errorSchema(['INTERNAL_ERROR']),
      },
    },
  }, async (request) => {
    service.authorizeOrganizer(request.params.organizerId, parseBearer(request.headers.authorization));
    const booking = service.cancelAsOrganizer(request.params.organizerId, request.params.bookingId);
    outboxWorker?.kick();
    return { booking };
  });

  return app;
}

function clientBookingSchema(): TSchema {
  return Type.Object({
    bookingId: Id,
    organizerId: Id,
    slot: SlotSchema,
    clientEmail: Email,
    cancellationCredential: Type.String(),
    status: Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')]),
    createdAt: UtcInstant,
  });
}

function organizerBookingSchema(): TSchema {
  return Type.Object({
    bookingId: Id,
    organizerId: Id,
    slot: SlotSchema,
    clientEmail: Email,
    status: Type.Union([Type.Literal('confirmed'), Type.Literal('cancelled')]),
    createdAt: UtcInstant,
  });
}

function errorSchema(codes: string[]): TSchema {
  const code = codes.length === 1
    ? Type.Literal(codes[0]!)
    : Type.Union(codes.map((value) => Type.Literal(value)));
  return Type.Object({
    error: Type.Object({
      code,
      message: Type.String(),
      details: Type.Optional(Type.Array(ErrorDetailSchema)),
      requestId: Type.Optional(Type.String()),
    }),
  });
}

function errorResponse(code: string, message: string, requestId: string, details?: Array<{ field: string; message: string }>) {
  return {
    error: {
      code,
      message,
      ...(details?.length ? { details } : {}),
      requestId,
    },
  };
}

function parseBearer(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}
