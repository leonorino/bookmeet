export interface Slot {
  slotId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
}

export interface OrganizerSlot extends Slot {
  state: "available" | "held" | "booked";
  holdExpiresAt?: string;
}

export interface Booking {
  bookingId: string;
  organizerId: string;
  slot: Slot;
  clientEmail: string;
  cancellationCredential: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
}

export interface OrganizerBooking {
  bookingId: string;
  organizerId: string;
  slot: Slot;
  clientEmail: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
}

export interface Hold {
  holdId: string;
  holdCredential: string;
  slot: Slot;
  expiresAt: string;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: "omit",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "The service could not be reached. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const apiError = payload as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      apiError?.error?.code ?? "REQUEST_FAILED",
      apiError?.error?.message ?? "The request could not be completed. Try again.",
      apiError?.error?.requestId,
    );
  }

  return payload as T;
}

function jsonBody(body: unknown, requestHeaders?: HeadersInit): Pick<RequestInit, "body" | "headers"> {
  const headers = new Headers(requestHeaders);
  headers.set("Content-Type", "application/json");
  return {
    body: JSON.stringify(body),
    headers,
  };
}

function bearerHeaders(managementKey: string): HeadersInit {
  return { Authorization: `Bearer ${managementKey}` };
}

function idPathSegment(id: string): string {
  return encodeURIComponent(id);
}

export const api = {
  createOrganizer(organizerEmail: string): Promise<{ organizerId: string; managementKey: string }> {
    return request("/v1/organizers", {
      method: "POST",
      ...jsonBody({ organizerEmail }),
    });
  },

  getOrganizerSlots(organizerId: string, managementKey: string): Promise<{ slots: OrganizerSlot[] }> {
    return request(`/v1/organizers/${idPathSegment(organizerId)}/slots`, {
      headers: bearerHeaders(managementKey),
    });
  },

  createOrganizerSlot(
    organizerId: string,
    managementKey: string,
    slot: Pick<Slot, "startAt" | "endAt" | "timeZone">,
  ): Promise<{ slot: Slot }> {
    return request(`/v1/organizers/${idPathSegment(organizerId)}/slots`, {
      ...jsonBody(slot, bearerHeaders(managementKey)),
      method: "POST",
    });
  },

  removeOrganizerSlot(organizerId: string, managementKey: string, slotId: string): Promise<void> {
    return request(`/v1/organizers/${idPathSegment(organizerId)}/slots/${idPathSegment(slotId)}`, {
      method: "DELETE",
      headers: bearerHeaders(managementKey),
    });
  },

  getOrganizerBookings(organizerId: string, managementKey: string): Promise<{ bookings: OrganizerBooking[] }> {
    return request(`/v1/organizers/${idPathSegment(organizerId)}/bookings`, {
      headers: bearerHeaders(managementKey),
    });
  },

  cancelOrganizerBooking(
    organizerId: string,
    managementKey: string,
    bookingId: string,
  ): Promise<{ booking: OrganizerBooking }> {
    return request(
      `/v1/organizers/${idPathSegment(organizerId)}/bookings/${idPathSegment(bookingId)}/cancellation`,
      { method: "POST", headers: bearerHeaders(managementKey) },
    );
  },

  getAvailability(organizerId: string): Promise<{ organizerId: string; slots: Slot[] }> {
    return request(`/v1/public/organizers/${idPathSegment(organizerId)}/availability`);
  },

  createHold(organizerId: string, slotId: string): Promise<{ hold: Hold }> {
    return request(`/v1/public/organizers/${idPathSegment(organizerId)}/holds`, {
      method: "POST",
      ...jsonBody({ slotId }),
    });
  },

  confirmHold(holdId: string, holdCredential: string, clientEmail: string): Promise<{ booking: Booking }> {
    return request(`/v1/public/holds/${idPathSegment(holdId)}/confirmation`, {
      method: "POST",
      ...jsonBody({ holdCredential, clientEmail }),
    });
  },

  cancelClientBooking(
    bookingId: string,
    cancellationCredential: string,
  ): Promise<{ booking: Booking }> {
    return request(`/v1/public/bookings/${idPathSegment(bookingId)}/cancellation`, {
      method: "POST",
      headers: { "X-Cancellation-Credential": cancellationCredential },
    });
  },
};
