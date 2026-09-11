// The product's name lives HERE only. Rename it in one place.
//
// "Hajir" (हाजिर) is what a student calls out at roll call: "Present!"
export const BRAND = {
  name: "Hajir",
  tagline: "Say present with a scan.",
  description: "QR attendance for schools and colleges. Students show a card or their phone, teachers scan, done.",
} as const;

export const pageTitle = (title?: string) => (title ? `${title} · ${BRAND.name}` : `${BRAND.name}: ${BRAND.tagline}`);
