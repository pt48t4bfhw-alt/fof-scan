/** Demande à l'iPhone de ne pas vider la mémoire de l'appli quand il manque de place. */
export async function demanderStockagePermanent(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
