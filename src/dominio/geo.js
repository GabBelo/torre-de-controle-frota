// Distância entre dois pontos GPS (fórmula de Haversine), em metros.
const RAIO_TERRA_M = 6_371_000;
const rad = (g) => (g * Math.PI) / 180;

export function distanciaMetros(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h));
}

/** Cerca virtual (geofence) circular. */
export function dentroDoRaio(ponto, local) {
  return distanciaMetros(ponto, local) <= local.raioM;
}
