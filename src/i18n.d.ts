import id from "../locales/id.json"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation",
    resources: {
      translation: typeof id
    }
  }
}
