/** SQL files are inlined as strings at build time (tsup text loader, vitest plugin). */
declare module "*.sql" {
  const sql: string;
  export default sql;
}
