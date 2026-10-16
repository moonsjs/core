/**
 * Addendum J.1: header internal berisi IP klien tepercaya. Server (`@moonsjs/vite`)
 * SELALU menimpa nilai ini pada request yang masuk — nilai dari klien dibuang —
 * sehingga aman dipakai sebagai kunci rate limit.
 */
export const CLIENT_IP_HEADER = "x-moons-client-ip";
