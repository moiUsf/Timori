import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

export const locales = ["de", "en", "fr", "es", "ar"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "de"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const requested = cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined
  const locale: Locale = requested && locales.includes(requested) ? requested : defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
