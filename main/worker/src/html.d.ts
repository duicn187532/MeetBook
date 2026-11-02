// wrangler 以文字匯入 .html（預設的 module rules）
declare module "*.html" {
  const content: string;
  export default content;
}
