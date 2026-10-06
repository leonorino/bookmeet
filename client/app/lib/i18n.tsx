import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

export type Language = "en" | "ru";
export type AppLocale = "en-US" | "ru-RU";
type TranslationValues = Record<string, string | number>;
type Translator = (key: string, values?: TranslationValues) => string;

const translations: Record<Language, Record<string, string>> = {
  en: {},
  ru: {
    "Language": "Язык",
    "Meeting Booking": "Бронирование встреч",
    "Get started": "Начало работы",
    "Return to your workspace": "Вернуться в рабочее пространство",
    "Enter your management key to manage your meeting times.": "Введите ключ управления, чтобы изменить время встреч.",
    "Saved on this device. A copy will be emailed to you. Keep the email as backup; if both copies are lost, the key cannot be recovered.": "Ключ сохранён на этом устройстве. Копия придёт вам по почте. Храните письмо как запасную копию: если потеряете обе копии, восстановить ключ нельзя.",
    "Not saved here. Copy it now. A copy will be emailed to you. Keep the email as backup; if both copies are lost, the key cannot be recovered.": "Ключ не сохранён на этом устройстве. Скопируйте его сейчас. Копия придёт по почте. Храните письмо как запасную копию: если потеряете обе копии, восстановить ключ нельзя.",
    "Booking confirmations and cancellations go to this address.": "Подтверждения и отмены бронирований приходят на этот адрес.",
    "Drag to select a start time and duration. On touch screens, tap a time, then set the duration below.": "Перетащите указатель, чтобы выбрать время начала и длительность. На сенсорном экране коснитесь времени и задайте длительность ниже.",
    "Cancellation form": "Форма отмены",
    "Meeting Booking home": "Главная — Бронирование встреч",
    "Main navigation": "Основная навигация",
    "Home": "Главная",
    "Cancel an existing booking": "Отменить существующее бронирование",
    "Public booking page": "Страница бронирования",
    "A simpler way to find a time": "Простой способ выбрать время",
    "Make time for the conversation.": "Найдите время для разговора.",
    "Share a few meeting times. Let clients choose the one that works for them.\n            No account and no back-and-forth needed.": "Предложите несколько вариантов времени. Пусть клиенты выберут подходящий.\n            Без аккаунта и долгих согласований.",
    "One clear time, confirmed for everyone.": "Одно удобное время, подтверждённое всеми.",
    "For organizers": "Организаторам",
    "Create a booking page": "Создать страницу бронирования",
    "Add your notification email to create a workspace. You can add meeting times next.": "Укажите почту для уведомлений, чтобы создать рабочее пространство. Затем вы сможете добавить время встреч.",
    "Organizer email": "Электронная почта организатора",
    "Booking confirmations and cancellations will be sent here.": "Подтверждения и отмены бронирований будут отправляться сюда.",
    "Creating page…": "Создание страницы…",
    "Create booking page": "Создать страницу бронирования",
    "Workspace ready": "Рабочее пространство готово",
    "Booking page created": "Страница бронирования создана",
    "Booking link": "Ссылка для бронирования",
    "Share this link with clients.": "Поделитесь этой ссылкой с клиентами.",
    "Public booking link": "Публичная ссылка для бронирования",
    "Copy link": "Скопировать ссылку",
    "Management key": "Ключ управления",
    "Keep this key private": "Храните этот ключ в тайне",
    "Copy key": "Скопировать ключ",
    "Saved on this device. Your organizer ID and key will also be emailed to you. Keep the key private; there is no recovery endpoint.": "Сохранено на этом устройстве. Идентификатор организатора и ключ также будут отправлены вам по почте. Храните ключ в тайне: восстановить его нельзя.",
    "Not saved here. Copy it now. Your organizer ID and key will also be emailed to you. Keep the key private; there is no recovery endpoint.": "Не сохранено. Скопируйте ключ сейчас. Идентификатор организатора и ключ также будут отправлены вам по почте. Храните ключ в тайне: восстановить его нельзя.",
    "Add meeting times": "Добавить время встреч",
    "Preview booking page": "Предпросмотр страницы бронирования",
    "Already have a page?": "Уже есть страница?",
    "Manage your availability.": "Управляйте доступным временем.",
    "Enter your management key to open your workspace and manage availability.": "Введите ключ управления, чтобы открыть рабочее пространство и управлять доступным временем.",
    "Opening workspace…": "Открытие рабочего пространства…",
    "How it works": "Как это работает",
    "A time chosen.": "Время выбрано.",
    "A plan confirmed.": "План подтверждён.",
    "Organizers share one-off meeting times.": "Организаторы предлагают время для отдельных встреч.",
    "Clients choose a time and add their email.": "Клиенты выбирают время и указывают свою почту.",
    "Both sides receive the confirmed meeting details.": "Обе стороны получают подтверждённые сведения о встрече.",
    "Cancel a booking": "Отменить бронирование",
    "The booking page could not be created. Try again.": "Не удалось создать страницу бронирования. Попробуйте ещё раз.",
    "Could not open this workspace. Try again.": "Не удалось открыть рабочее пространство. Попробуйте ещё раз.",
    "{label} copied.": "Скопировано: {label}.",
    "Copy unavailable. Select and copy the {label} above.": "Не удалось скопировать автоматически. Выделите значение «{label}» выше и скопируйте его.",
    "Choose a time": "Выберите время",
    "Book a meeting": "Забронировать встречу",
    "Times are shown in the time zone listed for each meeting.": "Время указано в часовом поясе, выбранном для каждой встречи.",
    "Booking confirmed": "Бронирование подтверждено",
    "You’re all set.": "Готово.",
    "A confirmation email with your booking ID and cancellation credential will be sent to {email}.": "Письмо с подтверждением, номером бронирования и кодом отмены будет отправлено на адрес {email}.",
    "Booking ID": "Номер бронирования",
    "Copy ID": "Скопировать номер",
    "Cancellation credential": "Код отмены",
    "Copy credential": "Скопировать код",
    "Use this credential or the emailed copy to cancel the booking.": "Для отмены используйте этот код или его копию из письма.",
    "Cancel this booking": "Отменить это бронирование",
    "Available meeting times": "Доступное время встреч",
    "Loading times…": "Загрузка времени…",
    "No meeting times are available right now.": "Сейчас нет доступного времени для встреч.",
    "Available": "Доступно",
    "Continues": "Продолжается",
    "Temporarily held": "Временно зарезервировано",
    "Booked": "Забронировано",
    "Confirmed": "Подтверждено",
    "Cancelled": "Отменено",
    "Adding…": "Добавление…",
    "Choose time": "Выбрать время",
    "Time reserved temporarily": "Время временно зарезервировано",
    "Complete your booking": "Завершите бронирование",
    "Temporarily held · about {time} remaining": "Временно удерживается · осталось около {time}",
    "Temporarily held · timer elapsed; confirmation will check availability": "Временно удерживается · время истекло; при подтверждении будет проверена доступность",
    "Email for confirmation": "Электронная почта для подтверждения",
    "Confirming…": "Подтверждение…",
    "Confirm booking": "Подтвердить бронирование",
    "Your earlier hold remains active and unavailable to others until it expires. You can choose another time now.": "Предыдущее время остаётся зарезервированным и недоступным другим до истечения срока. Сейчас можно выбрать другое время.",
    "That meeting time could not be held. Choose another.": "Не удалось зарезервировать это время. Выберите другое.",
    "That slot became unavailable. The available times have been refreshed; choose another time.": "Это время стало недоступно. Список обновлён; выберите другое время.",
    "That hold expired or the time was booked by someone else. Choose another available time.": "Резерв истёк или время забронировал другой человек. Выберите другое доступное время.",
    "Could not load available meeting times.": "Не удалось загрузить доступное время встреч.",
    "Could not confirm this booking. Try again.": "Не удалось подтвердить бронирование. Попробуйте ещё раз.",
    "Booking help": "Помощь с бронированием",
    "Enter the code from your confirmation.": "Введите код из подтверждения бронирования.",
    "This booking has already been cancelled.": "Это бронирование уже отменено.",
    "This booking is too close to its start time to cancel online. Contact the organizer for help.": "До начала встречи осталось слишком мало времени для отмены онлайн. Свяжитесь с организатором.",
    "The cancellation credential is invalid. Check it and try again.": "Неверный код отмены. Проверьте его и попробуйте ещё раз.",
    "Could not cancel this booking. Check your connection and try again.": "Не удалось отменить бронирование. Проверьте подключение и попробуйте ещё раз.",
    "Your booking has been cancelled. A cancellation confirmation email will be sent to the address associated with the booking.": "Бронирование отменено. На связанный с ним адрес будет отправлено письмо с подтверждением отмены.",
    "Return home": "На главную",
    "Cancellation details": "Данные для отмены",
    "Cancelling…": "Отмена…",
    "Organizer workspace": "Рабочее пространство организатора",
    "Manage your availability": "Управление доступным временем",
    "Enter your management key": "Введите ключ управления",
    "Use the key created with this booking page. It will be saved on this device.": "Используйте ключ, созданный вместе со страницей бронирования. Он будет сохранён на этом устройстве.",
    "Open workspace": "Открыть рабочее пространство",
    "Copy public link": "Скопировать публичную ссылку",
    "Loading workspace…": "Загрузка рабочего пространства…",
    "Add a meeting time": "Добавить время встречи",
    "Previous": "Назад",
    "Today": "Сегодня",
    "Next": "Далее",
    "Time zone": "Часовой пояс",
    "Drag within a day to choose a start time and duration. On touch screens, tap a time to choose a 15-minute start, then adjust the duration in the action bar.": "Перетащите указатель внутри дня, чтобы выбрать время начала и длительность. На сенсорном экране коснитесь времени, чтобы выбрать начало с шагом 15 минут, затем настройте длительность на панели действий.",
    "Availability for {date}": "Доступность на {date}",
    "Selected: {date}, {time} for {duration} minutes ({zone}).": "Выбрано: {date}, {time} на {duration} мин. ({zone}).",
    "Meeting times": "Время встреч",
    "No meeting times yet.": "Время встреч ещё не добавлено.",
    "minutes": "минут",
    "Remove": "Удалить",
    "Bookings": "Бронирования",
    "No bookings yet.": "Бронирований пока нет.",
    "Cancel booking": "Отменить бронирование",
    "Selected time": "Выбранное время",
    "Duration (minutes)": "Длительность (минуты)",
    "Could not load this workspace.": "Не удалось загрузить рабочее пространство.",
    "Duration must be a positive whole number of minutes.": "Длительность должна быть положительным целым числом минут.",
    "Meeting times must start in the future. Choose a later date and time.": "Встреча должна начинаться в будущем. Выберите более поздние дату и время.",
    "Meeting time added.": "Время встречи добавлено.",
    "Could not create the meeting time.": "Не удалось добавить время встречи.",
    "Meeting time removed.": "Время встречи удалено.",
    "Could not remove this meeting time.": "Не удалось удалить это время встречи.",
    "Booking cancelled.": "Бронирование отменено.",
    "Could not cancel this booking.": "Не удалось отменить бронирование.",
    "Public booking link copied.": "Публичная ссылка для бронирования скопирована.",
    "Could not copy automatically. Open the public booking page and copy its URL from your browser's address bar.": "Не удалось скопировать автоматически. Откройте страницу бронирования и скопируйте её адрес из адресной строки браузера.",
    "Hold until {time}": "Резерв до {time}",
    "The service could not be reached. Check your connection and try again.": "Не удалось связаться со службой. Проверьте подключение и попробуйте ещё раз.",
    "The request could not be completed. Try again.": "Не удалось выполнить запрос. Попробуйте ещё раз.",
    "The request is invalid.": "Запрос содержит недопустимые данные.",
    "The request could not be parsed.": "Не удалось обработать запрос.",
    "An internal error occurred.": "Произошла внутренняя ошибка.",
    "This management key does not grant access to the requested organizer.": "Этот ключ управления не даёт доступа к указанному организатору.",
    "A valid organizer management key is required.": "Требуется действительный ключ управления организатора.",
    "The organizer management key is invalid.": "Неверный ключ управления организатора.",
    "The organizer was not found.": "Организатор не найден.",
    "The slot was not found.": "Время встречи не найдено.",
    "The slot is no longer available.": "Это время встречи больше недоступно.",
    "The slot has already been booked.": "Это время уже забронировано.",
    "The slot is currently held by another client.": "Это время сейчас зарезервировано другим клиентом.",
    "The hold was not found.": "Резерв не найден.",
    "The hold credential is invalid.": "Неверный код резерва.",
    "The hold has expired.": "Срок резерва истёк.",
    "The hold can no longer be confirmed.": "Этот резерв больше нельзя подтвердить.",
    "The meeting has already started.": "Встреча уже началась.",
    "The booking was not found.": "Бронирование не найдено.",
    "The cancellation credential is invalid.": "Неверный код отмены.",
    "The booking has already been cancelled.": "Бронирование уже отменено.",
    "durationMinutes must be a positive whole number of minutes.": "durationMinutes должно быть положительным целым числом минут.",
    "durationMinutes produces an invalid end instant.": "durationMinutes задаёт недопустимое время окончания.",
    "startAt must be in the future.": "startAt должно находиться в будущем.",
    "timeZone must be a valid IANA time-zone identifier.": "timeZone должно быть допустимым идентификатором часового пояса IANA.",
    "The slot overlaps another active slot for this organizer.": "Это время пересекается с другим активным временем этого организатора.",
    "A booked slot cannot be removed.": "Нельзя удалить уже забронированное время.",
    "A booking can only be cancelled at least 24 hours before it starts.": "Бронирование можно отменить не позднее чем за 24 часа до начала.",
    "{field} must be an RFC 3339 UTC instant.": "{field} должно быть временем UTC в формате RFC 3339.",
    "{field} must be a valid date-time.": "{field} должно содержать допустимые дату и время.",
    "Invalid value.": "Недопустимое значение.",
    "Enter the date as {hint}.": "Введите дату в формате {hint}.",
    "Enter a valid date as {hint}.": "Введите допустимую дату в формате {hint}.",
    "Enter the time as {hint}.": "Введите время в формате {hint}.",
    "Enter a valid time.": "Введите допустимое время.",
    "Enter a valid date and time.": "Введите допустимые дату и время.",
    "Choose a valid IANA time zone.": "Выберите допустимый часовой пояс IANA.",
    "That local time does not exist because the clocks change. Choose another time.": "Этого местного времени не существует из-за перевода часов. Выберите другое время.",
    "That local time occurs twice because the clocks change. Choose another time.": "Это местное время повторяется из-за перевода часов. Выберите другое время.",
    "Create a booking page or open your organizer workspace.": "Создайте страницу бронирования или откройте рабочее пространство организатора.",
    "Cancel a booking — Meeting Booking": "Отмена бронирования — Бронирование встреч",
    "Cancel an existing meeting booking.": "Отмените существующее бронирование встречи.",
    "Organizer workspace — Meeting Booking": "Рабочее пространство организатора — Бронирование встреч",
    "Manage your meeting availability and bookings.": "Управляйте доступным временем и бронированиями встреч.",
    "Book a meeting — Meeting Booking": "Бронирование встречи — Бронирование встреч",
    "Choose an available meeting time.": "Выберите доступное время встречи.",
    "This browser could not save the key. It will only work until you leave this page, so keep it somewhere safe.": "Браузер не смог сохранить ключ. Он будет работать только пока вы не покинете страницу, поэтому сохраните его в надёжном месте.",
    "held": "удерживается",
    "booked": "забронировано",
    "confirmed": "подтверждено",
    "cancelled": "отменено",
  },
};

const metadata: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Meeting Booking",
    description: "Create a booking page or open your organizer workspace.",
  },
  "/cancel": { title: "Cancel a booking — Meeting Booking", description: "Cancel an existing meeting booking." },
  "/manage": { title: "Organizer workspace — Meeting Booking", description: "Manage your meeting availability and bookings." },
  "/book": { title: "Book a meeting — Meeting Booking", description: "Choose an available meeting time." },
};

function supportedLanguage(value: string | undefined): Language | undefined {
  const base = value?.toLowerCase().split("-")[0];
  return base === "en" || base === "ru" ? base : undefined;
}

const LANGUAGE_STORAGE_KEY = "meeting-booking-language";
interface SavedLanguagePreference {
  language: Language;
  updatedAt: number;
}

function parseSavedLanguage(value: string | null): SavedLanguagePreference | undefined {
  if (value === "en" || value === "ru") return { language: value, updatedAt: 0 };
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<SavedLanguagePreference>;
    if ((parsed.language === "en" || parsed.language === "ru") && typeof parsed.updatedAt === "number") {
      return { language: parsed.language, updatedAt: parsed.updatedAt };
    }
  } catch { /* Ignore malformed saved preferences. */ }
  return undefined;
}

function initialLanguage(): SavedLanguagePreference {
  const saved: SavedLanguagePreference[] = [];
  try {
    const preference = parseSavedLanguage(window.sessionStorage.getItem(LANGUAGE_STORAGE_KEY));
    if (preference) saved.push(preference);
  } catch { /* Storage is optional. */ }
  try {
    const preference = parseSavedLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    if (preference) saved.push(preference);
  } catch { /* Storage is optional. */ }
  if (saved.length > 0) {
    return saved.reduce((latest, preference) => preference.updatedAt > latest.updatedAt ? preference : latest);
  }
  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const preference of preferences) {
    const language = supportedLanguage(preference);
    if (language) return { language, updatedAt: 0 };
  }
  return { language: "en", updatedAt: 0 };
}

interface I18nContextValue {
  language: Language;
  locale: AppLocale;
  setLanguage: (language: Language) => void;
  t: Translator;
}
const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const latestPreferenceTime = useRef(0);
  const location = useLocation();
  useEffect(() => {
    const preference = initialLanguage();
    latestPreferenceTime.current = preference.updatedAt;
    setLanguageState(preference.language);
  }, []);
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    const updatedAt = latestPreferenceTime.current = Math.max(Date.now(), latestPreferenceTime.current + 1);
    const preference = JSON.stringify({ language: next, updatedAt });
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    } catch { /* Session storage may still preserve the selection. */ }
    try { window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, preference); } catch { /* Current session state remains active. */ }
  };
  const locale: AppLocale = language === "ru" ? "ru-RU" : "en-US";
  const t: Translator = (key, values = {}) => {
    const template = translations[language][key] ?? key;
    return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, name: string) => name in values ? String(values[name]) : match);
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    const path = location.pathname === "/" ? "/" : location.pathname.startsWith("/manage/") ? "/manage" : location.pathname.startsWith("/book/") ? "/book" : location.pathname;
    const page = metadata[path] ?? metadata["/"];
    document.title = t(page.title);
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.append(description);
    }
    description.content = t(page.description);
  }, [locale, location.pathname]);
  const value = useMemo(() => ({ language, locale, setLanguage, t }), [language, locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider");
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return <label className="language-switcher"><span className="visually-hidden">{t("Language")}</span><select aria-label={t("Language")} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="ru">Русский</option></select></label>;
}
