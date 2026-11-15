import { Alert, Platform } from 'react-native';

/** Pregunta Sí/No (en la PC usa la ventana del navegador). */
export function confirmAction(title: string, text: string, yes: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${text}`)) onYes();
    return;
  }
  Alert.alert(title, text, [
    { text: 'No', style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}
