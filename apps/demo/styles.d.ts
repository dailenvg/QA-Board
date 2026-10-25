/** Global stylesheets are side-effect imports handled by Next.js (TypeScript 6 checks these). */
declare module "*.css";

/** SQL migrations are bundled as text (webpack `asset/source`; a matching Vitest plugin). */
declare module "*.sql" {
  const sql: string;
  export default sql;
}
