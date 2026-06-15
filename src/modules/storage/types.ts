export const UPLOAD_KINDS = ['referencia', 'bolo-pronto', 'produto', 'inspiracao', 'festa'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const UPLOAD_KINDS_AUTHENTICATED = ['referencia', 'bolo-pronto', 'produto', 'inspiracao'] as const;
export type AuthenticatedUploadKind = (typeof UPLOAD_KINDS_AUTHENTICATED)[number];

export const S3_CLIENT = 'S3_CLIENT';
