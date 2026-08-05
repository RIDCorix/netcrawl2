export function translateWithFallback(translate: (key: string) => string, key: string, fallback: string): string {
  const translated = translate(key);
  return translated === key ? fallback : translated;
}
