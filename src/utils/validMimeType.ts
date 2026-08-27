// ARCHIVED
// type ImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
// const mimeToExt = {
// 	"image/jpeg": "jpg",
// 	"image/png": "png",
// 	"image/webp": "webp",
// 	"image/gif": "gif",
// } as const;
//
// export function getExtFromMime(mime: string): string | null {
// 	return (mimeToExt as Record<string, string>)[mime] ?? null;
// }
// export function isValidImageMime(mime: string): mime is ImageMimeType {
// 	return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime);
// }
