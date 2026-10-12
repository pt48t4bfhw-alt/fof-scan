import { createRequire } from 'node:module';

/**
 * OpenCV pour les tests Node. L'objet exporté par @techstark/opencv-js possède une méthode
 * `then` : importé normalement, son espace de noms passe pour une promesse et `await import()`
 * boucle sans fin. Ce module n'exporte que `default`, chargé par `require`.
 */
export default createRequire(import.meta.url)('@techstark/opencv-js');
