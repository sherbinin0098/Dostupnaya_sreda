// Экранный код написан в стиле «найти элемент и повесить обработчик»: разрешаем обращаться к свойствам элементов без перечисления типов.
interface Element {
  [key: string]: any;
}
interface EventTarget {
  [key: string]: any;
}
interface Window {
  Capacitor?: any;
  androidBridge?: any;
}
declare const L: any; // Leaflet подгружается на странице отдельно
