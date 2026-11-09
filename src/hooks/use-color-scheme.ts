/**
 * La app siempre usa el tema claro (fondo blanco), aunque el teléfono esté en modo oscuro.
 * Para volver a seguir el tema del teléfono, exporta `useColorScheme` de 'react-native'.
 */
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
