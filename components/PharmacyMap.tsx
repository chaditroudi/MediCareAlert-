import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pharmacy, PharmacyInventory, User, UserRole } from '../types';
import { API_BASE } from '../lib/appConfig';

interface PharmacyMapProps {
  user: User;
}

type Coordinates = { lat: number; lng: number };

type LocatorStatus = 'idle' | 'locating' | 'active' | 'manual' | 'error';

type PharmacyResult = {
  id: string;
  dbId?: string;
  name: string;
  address: string;
  location: Coordinates;
  distanceKm: number;
  phone?: string;
  source: 'db' | 'overpass';
  services: string[];
  inventoryItems?: PharmacyInventory[];
  inventorySummary?: Record<PharmacyInventory['stockStatus'], number>;
  medicationMatchStatus?: PharmacyInventory['stockStatus'] | 'unknown' | null;
};

type RouteSummary = {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
  steps: string[];
};

type LeafletMap = {
  setView(center: [number, number], zoom: number): void;
  flyTo(center: [number, number], zoom?: number): void;
  fitBounds(bounds: unknown, options?: unknown): void;
  remove(): void;
};

type LeafletMarker = {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(html: string): LeafletMarker;
  openPopup(): void;
  setLatLng(position: [number, number]): void;
  remove(): void;
};

type LeafletPolyline = {
  addTo(map: LeafletMap): LeafletPolyline;
  getBounds(): unknown;
  remove(): void;
};

type LeafletGlobal = {
  map(element: HTMLElement): LeafletMap;
  tileLayer(url: string, options: Record<string, unknown>): { addTo(map: LeafletMap): void };
  marker(position: [number, number], options?: Record<string, unknown>): LeafletMarker;
  polyline(points: [number, number][], options?: Record<string, unknown>): LeafletPolyline;
  divIcon(options: Record<string, unknown>): unknown;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

const DEFAULT_CENTER: [number, number] = [36.8065, 10.1815];
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: 'L’autorisation de localisation a été refusée. Saisissez votre ville ou votre adresse ci-dessous pour continuer.',
  2: 'Votre position est indisponible pour le moment. Vous pouvez saisir une ville ou une adresse à la place.',
  3: 'La demande de localisation a expiré. Réessayez ou saisissez votre ville ou votre adresse manuellement.',
};

const haversineDistanceKm = (from: Coordinates, to: Coordinates) => {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const formatDistance = (distanceKm: number) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

const formatDuration = (durationMin: number) => {
  if (durationMin < 60) {
    return `${Math.round(durationMin)} min`;
  }
  const hours = Math.floor(durationMin / 60);
  const minutes = Math.round(durationMin % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const createEmptyInventorySummary = (): Record<PharmacyInventory['stockStatus'], number> => ({
  available: 0,
  low: 0,
  out_of_stock: 0,
  expired: 0,
});

const summarizeInventory = (items: PharmacyInventory[]) =>
  items.reduce((summary, item) => {
    summary[item.stockStatus] += 1;
    return summary;
  }, createEmptyInventorySummary());

const findMedicationMatchStatus = (items: PharmacyInventory[], medicationQuery: string): PharmacyInventory['stockStatus'] | 'unknown' | null => {
  if (!medicationQuery.trim()) {
    return null;
  }

  const query = normalizeText(medicationQuery);
  const match = items.find((item) => normalizeText(item.medicationName).includes(query));
  return match ? match.stockStatus : 'unknown';
};

const stockStatusMeta: Record<PharmacyInventory['stockStatus'], { label: string; className: string }> = {
  available: { label: 'Disponible', className: 'bg-emerald-50 text-emerald-700' },
  low: { label: 'Stock bas', className: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Rupture', className: 'bg-rose-50 text-rose-700' },
  expired: { label: 'Expiré', className: 'bg-slate-100 text-slate-600' },
};

const fetchWithRetry = async (input: RequestInfo | URL, init: RequestInit | undefined, retries = 3, baseDelayMs = 700) => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === retries) {
        return response;
      }
      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw error;
      }
    }

    await delay(baseDelayMs * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
};

let leafletLoader: Promise<LeafletGlobal> | null = null;

const loadLeaflet = () => {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (!leafletLoader) {
    leafletLoader = new Promise((resolve, reject) => {
      const existingCss = document.querySelector(`link[data-leaflet="true"]`);
      if (!existingCss) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = LEAFLET_CSS_URL;
        css.dataset.leaflet = 'true';
        document.head.appendChild(css);
      }

      const existingScript = document.querySelector(`script[data-leaflet="true"]`) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          if (window.L) {
            resolve(window.L);
          } else {
            reject(new Error('Leaflet loaded without global object.'));
          }
        });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Leaflet.')));
        return;
      }

      const script = document.createElement('script');
      script.src = LEAFLET_JS_URL;
      script.async = true;
      script.dataset.leaflet = 'true';
      script.onload = () => {
        if (window.L) {
          resolve(window.L);
        } else {
          reject(new Error('Leaflet loaded without global object.'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Leaflet.'));
      document.body.appendChild(script);
    });
  }

  return leafletLoader;
};

const PharmacyMap: React.FC<PharmacyMapProps> = ({ user }) => {
  const [locatorStatus, setLocatorStatus] = useState<LocatorStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('En attente de votre position.');
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [searchRadius, setSearchRadius] = useState(3000);
  const [dbPharmacies, setDbPharmacies] = useState<Pharmacy[]>([]);
  const [inventoryByPharmacy, setInventoryByPharmacy] = useState<Record<string, PharmacyInventory[]>>({});
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [medicationFilter, setMedicationFilter] = useState('');
  const [overpassPharmacies, setOverpassPharmacies] = useState<PharmacyResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyResult | null>(null);
  const [routeMode, setRouteMode] = useState<'driving' | 'walking' | 'cycling'>('driving');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [route, setRoute] = useState<RouteSummary | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const pharmacyMarkersRef = useRef<LeafletMarker[]>([]);
  const routeLineRef = useRef<LeafletPolyline | null>(null);
  const latestUserLocationRef = useRef<Coordinates | null>(null);

  const savedProfileLocation = useMemo(() => {
    if (
      user.role !== UserRole.PATIENT ||
      typeof user.location?.lat !== 'number' ||
      typeof user.location?.lng !== 'number'
    ) {
      return null;
    }

    return {
      lat: user.location.lat,
      lng: user.location.lng,
    };
  }, [user.location, user.role]);

  const nearbyDbPharmacies = useMemo(() => {
    if (!userLocation) {
      return [];
    }

    return dbPharmacies
      .filter(
        (pharmacy) =>
          pharmacy.location &&
          typeof pharmacy.location.lat === 'number' &&
          typeof pharmacy.location.lng === 'number'
      )
      .map((pharmacy) => {
        const inventoryItems = inventoryByPharmacy[pharmacy.id] || [];
        return {
          id: `db-${pharmacy.id}`,
          dbId: pharmacy.id,
          name: pharmacy.name,
          address: pharmacy.address,
          location: pharmacy.location,
          distanceKm: haversineDistanceKm(userLocation, pharmacy.location),
          phone: pharmacy.phone,
          source: 'db' as const,
          services: pharmacy.services || [],
          inventoryItems,
          inventorySummary: summarizeInventory(inventoryItems),
          medicationMatchStatus: findMedicationMatchStatus(inventoryItems, medicationFilter),
        };
      })
      .filter((pharmacy) => pharmacy.distanceKm <= searchRadius / 1000)
      .filter((pharmacy) => {
        if (!medicationFilter.trim()) {
          return true;
        }
        return pharmacy.medicationMatchStatus && pharmacy.medicationMatchStatus !== 'unknown';
      });
  }, [dbPharmacies, inventoryByPharmacy, medicationFilter, searchRadius, userLocation]);

  const pharmacies = useMemo(() => {
    const merged: PharmacyResult[] = [...nearbyDbPharmacies];

    overpassPharmacies.forEach((pharmacy) => {
      const existingIndex = merged.findIndex((candidate) => {
        const closeMatch = haversineDistanceKm(candidate.location, pharmacy.location) < 0.12;
        const sameName = normalizeText(candidate.name) === normalizeText(pharmacy.name);
        return closeMatch || sameName;
      });

      if (existingIndex >= 0) {
        const existing = merged[existingIndex];
        merged[existingIndex] = {
          ...pharmacy,
          ...existing,
          distanceKm: Math.min(existing.distanceKm, pharmacy.distanceKm),
          services: existing.services.length > 0 ? existing.services : pharmacy.services,
          source: existing.source,
        };
        return;
      }

      merged.push(pharmacy);
    });

    return merged.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [nearbyDbPharmacies, overpassPharmacies]);

  const statusTone = useMemo(() => {
    if (locatorStatus === 'active') {
      return {
        dot: 'bg-emerald-500',
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: 'Actif',
      };
    }

    if (locatorStatus === 'locating') {
      return {
        dot: 'bg-blue-500 animate-pulse',
        pill: 'bg-blue-50 text-blue-700 border-blue-200',
        label: 'Localisation',
      };
    }

    if (locatorStatus === 'manual') {
      return {
        dot: 'bg-amber-500',
        pill: 'bg-amber-50 text-amber-700 border-amber-200',
        label: 'Manuel',
      };
    }

    return {
      dot: 'bg-rose-500',
      pill: 'bg-rose-50 text-rose-700 border-rose-200',
      label: 'Action requise',
    };
  }, [locatorStatus]);

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) {
          return;
        }

        const map = L.map(mapContainerRef.current);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        map.setView(DEFAULT_CENTER, 12);
        mapRef.current = map;
      })
      .catch(() => {
        setStatusMessage('La carte n’a pas pu être chargée. Actualisez la page puis réessayez.');
        setLocatorStatus('error');
      });

    return () => {
      cancelled = true;
      routeLineRef.current?.remove();
      userMarkerRef.current?.remove();
      pharmacyMarkersRef.current.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      routeLineRef.current = null;
      userMarkerRef.current = null;
      pharmacyMarkersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchExistingPharmacies = async () => {
      setDbLoading(true);
      setDbError('');

      try {
        const response = await fetch(`${API_BASE}/pharmacies`);
        if (!response.ok) {
          throw new Error(`Pharmacy request failed with ${response.status}`);
        }

        const pharmaciesFromApi: Pharmacy[] = await response.json();
        if (cancelled) {
          return;
        }

        setDbPharmacies(pharmaciesFromApi);

        const inventoryEntries = await Promise.all(
          pharmaciesFromApi.map(async (pharmacy) => {
            try {
              const inventoryResponse = await fetch(`${API_BASE}/pharmacies/${pharmacy.id}/inventory`);
              if (!inventoryResponse.ok) {
                throw new Error(`Inventory request failed with ${inventoryResponse.status}`);
              }
              const inventory = (await inventoryResponse.json()) as PharmacyInventory[];
              return [pharmacy.id, inventory] as const;
            } catch (error) {
              console.error(error);
              return [pharmacy.id, []] as const;
            }
          })
        );

        if (!cancelled) {
          setInventoryByPharmacy(Object.fromEntries(inventoryEntries));
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setDbError('Les pharmacies enregistrées dans l’application n’ont pas pu être chargées depuis l’API locale.');
        }
      } finally {
        if (!cancelled) {
          setDbLoading(false);
        }
      }
    };

    fetchExistingPharmacies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.L) {
      return;
    }

    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    const L = window.L;
    const markerHtml = `
      <div style="width:18px;height:18px;border-radius:9999px;background:#16a34a;border:3px solid white;box-shadow:0 0 0 4px rgba(22,163,74,0.18);"></div>
    `;

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({
          className: 'user-location-marker',
          html: markerHtml,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    }

    mapRef.current.flyTo([userLocation.lat, userLocation.lng], 14);
    userMarkerRef.current.bindPopup('Votre position');
  }, [userLocation]);

  useEffect(() => {
    latestUserLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    if (!mapRef.current || !window.L) {
      return;
    }

    pharmacyMarkersRef.current.forEach((marker) => marker.remove());
    pharmacyMarkersRef.current = [];

    const L = window.L;

    pharmacies.forEach((pharmacy) => {
      const marker = L.marker([pharmacy.location.lat, pharmacy.location.lng])
        .addTo(mapRef.current!)
        .bindPopup(
          `<strong>${pharmacy.name}</strong><br/>${pharmacy.address}<br/>${formatDistance(pharmacy.distanceKm)}${pharmacy.source === 'db' ? '<br/>Enregistrée dans l’application' : ''}`
        );

      pharmacyMarkersRef.current.push(marker);
    });
  }, [pharmacies]);

  useEffect(() => {
    if (!mapRef.current || !window.L) {
      return;
    }

    routeLineRef.current?.remove();
    routeLineRef.current = null;

    if (!route || route.coordinates.length === 0) {
      return;
    }

    const L = window.L;
    routeLineRef.current = L.polyline(route.coordinates, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.9,
    }).addTo(mapRef.current);

    mapRef.current.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });
  }, [route]);

  const searchNearbyPharmacies = async (origin: Coordinates, radius = searchRadius) => {
    setSearchLoading(true);
    setSearchError('');

    try {
      const query = `[out:json];node["amenity"="pharmacy"](around:${radius},${origin.lat},${origin.lng});out body;`;
      const response = await fetchWithRetry(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
        },
        body: query,
      }, 3, 800);

      if (!response.ok) {
        throw new Error(`Overpass request failed with ${response.status}`);
      }

      const data = await response.json();
      const results: PharmacyResult[] = (data.elements || [])
        .map((element: any, index: number) => {
          const pharmacyLocation = { lat: element.lat, lng: element.lon };
          const tags = element.tags || {};
          const distanceKm = haversineDistanceKm(origin, pharmacyLocation);
          const addressParts = [
            tags['addr:housenumber'],
            tags['addr:street'],
            tags['addr:city'],
          ].filter(Boolean);

          return {
            id: String(element.id ?? index),
            name: tags.name || 'Pharmacie à proximité',
            address: addressParts.join(' ').trim() || tags['addr:full'] || 'Adresse non disponible',
            location: pharmacyLocation,
            distanceKm,
            phone: tags.phone || tags['contact:phone'] || '',
            source: 'overpass',
            services: [],
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);

      setOverpassPharmacies(results);
      setRoute(null);
      setRouteError('');
    } catch (error) {
      console.error(error);
      setSearchError('Impossible de charger les pharmacies à proximité pour le moment. Veuillez réessayer.');
      setOverpassPharmacies([]);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!savedProfileLocation) {
      return;
    }

    setUserLocation(savedProfileLocation);
    setRoute(null);
    setRouteError('');
    setSearchError('');
    setManualError('');
    setLocatorStatus('active');
    setStatusMessage('Using the location saved in your profile to find the nearest pharmacies.');
    searchNearbyPharmacies(savedProfileLocation, searchRadius);
  }, [savedProfileLocation]);

  useEffect(() => {
    if (!latestUserLocationRef.current) {
      return;
    }

    searchNearbyPharmacies(latestUserLocationRef.current, searchRadius);
  }, [searchRadius]);

  const handleGeolocationSuccess = async (coords: Coordinates, source: 'gps' | 'manual') => {
    setUserLocation(coords);
    setRoute(null);
    setRouteError('');
    setSearchError('');
    setStatusMessage(source === 'gps' ? 'Position trouvée. Recherche des pharmacies à proximité.' : 'Position manuelle trouvée. Recherche des pharmacies à proximité.');
    setLocatorStatus('active');
    await searchNearbyPharmacies(coords);
    setStatusMessage(source === 'gps' ? 'Position active. Les pharmacies à proximité sont prêtes.' : 'Position manuelle active. Les pharmacies à proximité sont prêtes.');
    setLocatorStatus('active');
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocatorStatus('error');
      setStatusMessage('La géolocalisation n’est pas prise en charge par ce navigateur. Saisissez votre ville ou votre adresse ci-dessous.');
      return;
    }

    setLocatorStatus('locating');
    setStatusMessage('Localisation en cours...');
    setManualError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handleGeolocationSuccess(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          'gps'
        );
      },
      (error) => {
        setLocatorStatus('error');
        setStatusMessage(GEOLOCATION_MESSAGES[error.code] || 'Unable to get your location. Enter your city or address below.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  useEffect(() => {
    if (savedProfileLocation) {
      return;
    }

    requestLocation();
  }, [savedProfileLocation]);

  const handleManualLocationSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!manualLocation.trim()) {
      setManualError('Enter a city or address to continue.');
      return;
    }

    setManualLoading(true);
    setManualError('');

    try {
      const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(manualLocation.trim())}`;
      const response = await fetchWithRetry(url, {
        headers: {
          Accept: 'application/json',
        },
      }, 2, 500);

      if (!response.ok) {
        throw new Error(`Nominatim request failed with ${response.status}`);
      }

      const results = await response.json();
      const firstResult = results?.[0];

      if (!firstResult) {
        setManualError('Impossible de trouver cet endroit. Essayez une ville ou une adresse plus précise.');
        return;
      }

      await handleGeolocationSuccess(
        {
          lat: Number(firstResult.lat),
          lng: Number(firstResult.lon),
        },
        'manual'
      );
    } catch (error) {
      console.error(error);
      setManualError('La recherche de la position manuelle a échoué. Veuillez réessayer.');
    } finally {
      setManualLoading(false);
    }
  };

  const fetchRoute = async (pharmacy: PharmacyResult, mode = routeMode) => {
    if (!userLocation) {
      setRouteError('Définissez votre position avant de demander un itinéraire.');
      return;
    }

    setSelectedPharmacy(pharmacy);
    setRouteLoading(true);
    setRouteError('');

    try {
      const url = `${OSRM_BASE_URL}/${mode}/${userLocation.lng},${userLocation.lat};${pharmacy.location.lng},${pharmacy.location.lat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetchWithRetry(url, undefined, 3, 800);

      if (!response.ok) {
        throw new Error(`OSRM request failed with ${response.status}`);
      }

      const data = await response.json();
      const routeData = data.routes?.[0];

      if (!routeData) {
        throw new Error('No route available');
      }

      const coordinates: [number, number][] = (routeData.geometry?.coordinates || []).map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );

      const steps = (routeData.legs?.[0]?.steps || [])
        .map((step: any) => {
          const instruction = step.maneuver?.instruction;
          const name = step.name ? ` onto ${step.name}` : '';
          return instruction ? `${instruction}${name}` : null;
        })
        .filter(Boolean)
        .slice(0, 8);

      setRoute({
        distanceKm: routeData.distance / 1000,
        durationMin: routeData.duration / 60,
        coordinates,
        steps,
      });
    } catch (error) {
      console.error(error);
      setRoute(null);
      setRouteError('Impossible de charger l’itinéraire pour le moment. Veuillez réessayer.');
    } finally {
      setRouteLoading(false);
    }
  };

  const resultHeading = searchLoading
    ? 'Recherche des pharmacies près de vous...'
    : pharmacies.length > 0
      ? `${pharmacies.length} pharmacies trouvées`
      : 'Pharmacies à proximité';

  useEffect(() => {
    if (pharmacies.length === 0) {
      setSelectedPharmacy(null);
      return;
    }

    if (!selectedPharmacy) {
      setSelectedPharmacy(pharmacies[0]);
      return;
    }

    const stillExists = pharmacies.find((pharmacy) => pharmacy.id === selectedPharmacy.id);
    if (!stillExists) {
      setSelectedPharmacy(pharmacies[0]);
    }
  }, [pharmacies, selectedPharmacy]);

  return (
    <div className="h-full space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-[11px] font-black uppercase tracking-[0.22em] ${statusTone.pill}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${statusTone.dot}`}></span>
              {statusTone.label}
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-900">Localisateur de pharmacies</h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">{statusMessage}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={requestLocation}
              disabled={locatorStatus === 'locating'}
              className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-3"
            >
              {locatorStatus === 'locating' ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-location-crosshairs"></i>}
              {locatorStatus === 'locating' ? 'Localisation...' : 'Utiliser ma position'}
            </button>

            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
              <label htmlFor="radius" className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Rayon
              </label>
              <select
                id="radius"
                value={searchRadius}
                onChange={(event) => setSearchRadius(Number(event.target.value))}
                className="bg-transparent text-sm font-bold text-slate-700 outline-none"
              >
                <option value={1000}>1 km</option>
                <option value={3000}>3 km</option>
                <option value={5000}>5 km</option>
                <option value={10000}>10 km</option>
              </select>
            </div>
          </div>
        </div>

        {(locatorStatus === 'error' || locatorStatus === 'manual') && (
          <form onSubmit={handleManualLocationSubmit} className="mt-6 bg-slate-50 border border-slate-100 rounded-[2rem] p-4 md:p-5">
            <label htmlFor="manual-location" className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Saisir une ville ou une adresse
            </label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                id="manual-location"
                type="text"
                value={manualLocation}
                onChange={(event) => setManualLocation(event.target.value)}
                placeholder="Exemple : Tunis, Sfax ou 12 rue Principale"
                className="flex-1 px-5 py-4 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
              />
              <button
                type="submit"
                disabled={manualLoading}
                className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition disabled:opacity-60 flex items-center justify-center gap-3"
              >
                {manualLoading ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-search-location"></i>}
                {manualLoading ? 'Recherche...' : 'Utiliser cette position'}
              </button>
            </div>
            {manualError && <p className="mt-3 text-sm font-semibold text-rose-600">{manualError}</p>}
          </form>
        )}

        {searchError && (
          <div className="mt-6 bg-rose-50 border border-rose-200 text-rose-700 rounded-[2rem] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm font-semibold">{searchError}</p>
            <button
              onClick={() => userLocation && searchNearbyPharmacies(userLocation)}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition"
            >
              Relancer la recherche
            </button>
          </div>
        )}

        {dbError && (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-[2rem] p-4">
            <p className="text-sm font-semibold">{dbError}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[760px]">
        <div className="lg:col-span-4 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-black text-slate-900">{resultHeading}</h3>
              {searchLoading && <i className="fas fa-circle-notch animate-spin text-blue-600"></i>}
            </div>
          </div>

          {!searchLoading && pharmacies.length === 0 && !searchError && userLocation && (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 text-center">
              <i className="fas fa-map-location-dot text-4xl text-slate-200 mb-4"></i>
              <p className="text-base font-black text-slate-700">Aucune pharmacie trouvée à proximité</p>
              <p className="mt-2 text-sm text-slate-500 font-medium">Essayez d’augmenter le rayon de recherche pour couvrir une zone plus large.</p>
              <button
                onClick={() => {
                  const nextRadius = Math.min(searchRadius * 2, 10000);
                  setSearchRadius(nextRadius);
                  searchNearbyPharmacies(userLocation, nextRadius);
                }}
                className="mt-5 px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition"
              >
                Augmenter le rayon
              </button>
            </div>
          )}

          {pharmacies.map((pharmacy) => {
            const isSelected = selectedPharmacy?.id === pharmacy.id;

            return (
              <div
                key={pharmacy.id}
                className={`bg-white p-6 rounded-[2.5rem] border shadow-sm transition-all ${isSelected ? 'border-blue-500 shadow-xl' : 'border-slate-100 hover:border-blue-300'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{pharmacy.name}</h3>
                    <p className="mt-2 text-sm text-slate-500 font-medium">{pharmacy.address}</p>
                    {pharmacy.phone && (
                      <p className="mt-2 text-xs font-bold text-slate-400">{pharmacy.phone}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-blue-600">{formatDistance(pharmacy.distanceKm)}</p>
                    <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest">
                      {pharmacy.source === 'db' ? 'Enregistrée dans l’app' : 'OpenStreetMap'}
                    </p>
                  </div>
                </div>

                {(pharmacy.services.length > 0 || pharmacy.inventorySummary || pharmacy.medicationMatchStatus) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pharmacy.services.map((service) => (
                      <span
                        key={`${pharmacy.id}-${service}`}
                        className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-widest"
                      >
                        {service}
                      </span>
                    ))}
                    {pharmacy.inventorySummary && (
                      <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-black uppercase tracking-widest">
                        {pharmacy.inventorySummary.available} Disponible
                      </span>
                    )}
                    {pharmacy.inventorySummary && pharmacy.inventorySummary.low > 0 && (
                      <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-black uppercase tracking-widest">
                        {pharmacy.inventorySummary.low} Stock bas
                      </span>
                    )}
                    {pharmacy.medicationMatchStatus && (
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${
                          pharmacy.medicationMatchStatus === 'available'
                            ? 'bg-emerald-50 text-emerald-700'
                            : pharmacy.medicationMatchStatus === 'low'
                              ? 'bg-amber-50 text-amber-700'
                              : pharmacy.medicationMatchStatus === 'unknown'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {pharmacy.medicationMatchStatus === 'unknown'
                          ? 'Médicament non listé'
                          : `Médicament ${pharmacy.medicationMatchStatus === 'available' ? 'disponible' : pharmacy.medicationMatchStatus === 'low' ? 'en stock bas' : pharmacy.medicationMatchStatus === 'out_of_stock' ? 'en rupture' : 'expiré'}`}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setSelectedPharmacy(pharmacy);
                      mapRef.current?.flyTo([pharmacy.location.lat, pharmacy.location.lng], 16);
                    }}
                    className="px-4 py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition"
                  >
                    Voir sur la carte
                  </button>
                  <button
                    onClick={() => fetchRoute(pharmacy)}
                    disabled={routeLoading && isSelected}
                    className="px-4 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-3"
                  >
                    {routeLoading && isSelected ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-route"></i>}
                    Obtenir l’itinéraire
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-8 grid grid-rows-[minmax(0,1fr)_auto] gap-4">
          <div className="relative bg-slate-200 rounded-[3rem] overflow-hidden border border-slate-100 shadow-inner">
            <div ref={mapContainerRef} className="h-full w-full" />
            {(locatorStatus === 'locating' || searchLoading || routeLoading) && (
              <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] flex items-center justify-center">
                <div className="bg-white/95 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4">
                  <i className="fas fa-circle-notch animate-spin text-blue-600 text-lg"></i>
                  <span className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    {locatorStatus === 'locating' ? 'Localisation...' : routeLoading ? 'Construction de l’itinéraire...' : 'Recherche des pharmacies...'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Navigation intégrée</h3>
                <p className="mt-2 text-sm text-slate-500 font-medium">
                  Les itinéraires restent dans l’application via OSRM et s’affichent directement sur la carte Leaflet.
                </p>
              </div>

              <div className="flex gap-2">
                {(['driving', 'walking', 'cycling'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setRouteMode(mode);
                      if (selectedPharmacy) {
                        fetchRoute(selectedPharmacy, mode);
                      }
                    }}
                    className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition ${routeMode === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {mode === 'driving' ? 'voiture' : mode === 'walking' ? 'marche' : 'vélo'}
                  </button>
                ))}
              </div>
            </div>

            {routeError && (
              <div className="mt-5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <p className="text-sm font-semibold">{routeError}</p>
                {selectedPharmacy && (
                  <button
                    onClick={() => fetchRoute(selectedPharmacy)}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition"
                  >
                    Relancer l’itinéraire
                  </button>
                )}
              </div>
            )}

            {route && selectedPharmacy ? (
              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Destination</p>
                    <p className="mt-2 text-base font-black text-slate-900">{selectedPharmacy.name}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Distance</p>
                    <p className="mt-2 text-base font-black text-blue-600">{formatDistance(route.distanceKm)}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Temps estimé</p>
                    <p className="mt-2 text-base font-black text-emerald-600">{formatDuration(route.durationMin)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Étapes du trajet</p>
                  <div className="space-y-2">
                    {(route.steps.length > 0 ? route.steps : ['Itinéraire affiché sur la carte.']).map((step, index) => (
                      <div key={`${step}-${index}`} className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-sm font-semibold text-slate-700">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 bg-slate-50 border border-slate-100 rounded-[2rem] p-6 text-center">
                <i className="fas fa-route text-3xl text-slate-300 mb-3"></i>
                <p className="text-base font-black text-slate-700">Choisissez une pharmacie pour générer un itinéraire</p>
                <p className="mt-2 text-sm text-slate-500 font-medium">Le tracé apparaîtra directement sur la carte ci-dessus.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PharmacyMap;
