import i18next from "i18next";
import id from "../../locales/id.json"

export const initi18n = async () => {
  await i18next.init({
    lng: "id",
    resources: {
      id: {
        translation: id
      }
    },
    interpolation: {
      escapeValue: false
    }
  })
  return i18next
}

export { i18next }
