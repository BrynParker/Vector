const point = (id, name, lat, lon, extra = {}) => ({ id, name, lat, lon, ...extra });

export const catalogs = {
  geopolitical: {
    militaryBases: [
      point("mb-1", "Fort Liberty", 35.1414, -79.006, { country: "US" }),
      point("mb-2", "Camp Pendleton", 33.3858, -117.5409, { country: "US" }),
      point("mb-3", "Naval Station Norfolk", 36.9467, -76.3307, { country: "US" }),
      point("mb-4", "Ramstein Air Base", 49.4369, 7.6003, { country: "DE" }),
      point("mb-5", "Camp Humphreys", 36.9655, 127.0262, { country: "KR" }),
      point("mb-6", "Naval Base San Diego", 32.6848, -117.1187, { country: "US" }),
      point("mb-7", "Fort Cavazos", 31.1349, -97.7756, { country: "US" }),
      point("mb-8", "Joint Base Pearl Harbor", 21.351, -157.9497, { country: "US" }),
      point("mb-9", "Al Udeid Air Base", 25.117, 51.314, { country: "QA" }),
      point("mb-10", "Incirlik Air Base", 37.0021, 35.4259, { country: "TR" }),
      point("mb-11", "Diego Garcia", -7.3133, 72.4111, { country: "IO" }),
      point("mb-12", "Andersen Air Force Base", 13.584, 144.9318, { country: "GU" }),
      point("mb-13", "RAF Akrotiri", 34.5909, 32.9879, { country: "CY" }),
      point("mb-14", "Naval Support Activity Bahrain", 26.2276, 50.5876, { country: "BH" }),
      point("mb-15", "Yokosuka Naval Base", 35.281, 139.667, { country: "JP" }),
      point("mb-16", "Kadena Air Base", 26.3556, 127.7681, { country: "JP" }),
      point("mb-17", "Joint Base Elmendorf-Richardson", 61.251, -149.807, { country: "US" }),
      point("mb-18", "Minot Air Force Base", 48.4156, -101.357, { country: "US" }),
      point("mb-19", "Whiteman Air Force Base", 38.7303, -93.5477, { country: "US" }),
      point("mb-20", "Vandenberg SFB", 34.742, -120.5724, { country: "US" })
    ],
    nuclearSites: [
      point("ns-1", "Palo Verde Nuclear", 33.3893, -112.8656, { country: "US" }),
      point("ns-2", "Vogtle Electric Generating Plant", 33.1432, -81.7612, { country: "US" }),
      point("ns-3", "Sellafield", 54.4164, -3.5091, { country: "UK" }),
      point("ns-4", "Gravelines Nuclear", 51.0156, 2.1369, { country: "FR" }),
      point("ns-5", "Zaporizhzhia Nuclear Plant", 47.5119, 34.5855, { country: "UA" }),
      point("ns-6", "Kashiwazaki-Kariwa", 37.4227, 138.6022, { country: "JP" }),
      point("ns-7", "Bruce Nuclear Generating Station", 44.325, -81.599, { country: "CA" }),
      point("ns-8", "Qinshan Nuclear Power Plant", 30.4375, 120.9525, { country: "CN" })
    ],
    sanctions: [
      { id: "san-1", title: "Port sanctions expansion", lat: 25.2854, lon: 51.531, severity: "medium" },
      { id: "san-2", title: "Tech export controls update", lat: 37.5665, lon: 126.978, severity: "high" },
      { id: "san-3", title: "Dual-use semiconductor restrictions", lat: 35.6762, lon: 139.6503, severity: "high" },
      { id: "san-4", title: "Shipping insurance sanctions", lat: 51.5072, lon: -0.1276, severity: "medium" }
    ],
    protests: [
      { id: "pro-1", title: "Civic protest cluster", lat: 48.8566, lon: 2.3522, intensity: "high" },
      { id: "pro-2", title: "Labor protest cluster", lat: -23.5505, lon: -46.6333, intensity: "medium" },
      { id: "pro-3", title: "Election protest cluster", lat: 14.5995, lon: 120.9842, intensity: "high" },
      { id: "pro-4", title: "Fuel subsidy protests", lat: 6.5244, lon: 3.3792, intensity: "medium" }
    ],
    cyberIocs: [
      { id: "ioc-1", title: "Botnet C2 beaconing", lat: 50.1109, lon: 8.6821, confidence: "high" },
      { id: "ioc-2", title: "Ransomware infra pivot", lat: 1.3521, lon: 103.8198, confidence: "medium" },
      { id: "ioc-3", title: "Phishing CDN infrastructure", lat: 52.3676, lon: 4.9041, confidence: "high" },
      { id: "ioc-4", title: "Credential stuffing wave", lat: 37.7749, lon: -122.4194, confidence: "medium" }
    ],
    navalChokepoints: [
      point("nc-1", "Strait of Hormuz", 26.5619, 56.251, { risk: "high" }),
      point("nc-2", "Strait of Malacca", 2.5, 101.0, { risk: "high" }),
      point("nc-3", "Suez Canal", 30.5833, 32.2667, { risk: "high" }),
      point("nc-4", "Panama Canal", 9.0802, -79.6809, { risk: "medium" }),
      point("nc-5", "Bab-el-Mandeb", 12.5861, 43.3333, { risk: "high" }),
      point("nc-6", "Turkish Straits", 41.0082, 28.9784, { risk: "medium" })
    ],
    liveNewsHubs: [
      point("news-hub-1", "Washington Bureau Cluster", 38.9072, -77.0369, { source: "wire" }),
      point("news-hub-2", "London Bureau Cluster", 51.5072, -0.1276, { source: "wire" }),
      point("news-hub-3", "Dubai Bureau Cluster", 25.2048, 55.2708, { source: "wire" }),
      point("news-hub-4", "Singapore Bureau Cluster", 1.3521, 103.8198, { source: "wire" }),
      point("news-hub-5", "Nairobi Bureau Cluster", -1.2921, 36.8219, { source: "wire" })
    ],
    news: [
      { id: "news-1", title: "Regional ceasefire negotiations underway", lat: 31.7683, lon: 35.2137, source: "wire" },
      { id: "news-2", title: "Maritime security advisory updated", lat: 24.4539, lon: 54.3773, source: "wire" },
      { id: "news-3", title: "Cyber incident response escalated", lat: 52.52, lon: 13.405, source: "wire" }
    ]
  },
  finance: {
    stockExchanges: [
      point("ex-1", "NYSE", 40.7069, -74.0113, { city: "New York" }),
      point("ex-2", "NASDAQ MarketSite", 40.758, -73.9855, { city: "New York" }),
      point("ex-3", "London Stock Exchange", 51.5142, -0.0865, { city: "London" }),
      point("ex-4", "JPX", 35.6824, 139.766, { city: "Tokyo" }),
      point("ex-5", "Euronext Paris", 48.8738, 2.3286, { city: "Paris" }),
      point("ex-6", "SIX Swiss Exchange", 47.3686, 8.5392, { city: "Zurich" }),
      point("ex-7", "Hong Kong Exchange", 22.2855, 114.1577, { city: "Hong Kong" }),
      point("ex-8", "NSE India", 19.0176, 72.8562, { city: "Mumbai" }),
      point("ex-9", "B3 Brasil Bolsa Balcao", -23.5458, -46.6351, { city: "Sao Paulo" }),
      point("ex-10", "Johannesburg Stock Exchange", -26.2041, 28.0473, { city: "Johannesburg" })
    ],
    cryptoHubs: [
      point("cr-1", "Miami Crypto Hub", 25.7617, -80.1918),
      point("cr-2", "Singapore Crypto Hub", 1.3521, 103.8198),
      point("cr-3", "Dubai Crypto Hub", 25.2048, 55.2708),
      point("cr-4", "Lisbon Crypto Hub", 38.7223, -9.1393),
      point("cr-5", "Seoul Crypto Hub", 37.5665, 126.978),
      point("cr-6", "Hong Kong Crypto Hub", 22.3193, 114.1694)
    ],
    centralBanks: [
      point("cb-1", "Federal Reserve", 38.8951, -77.0364),
      point("cb-2", "European Central Bank", 50.1109, 8.6821),
      point("cb-3", "Bank of England", 51.5072, -0.1276),
      point("cb-4", "Bank of Japan", 35.6895, 139.6917),
      point("cb-5", "People's Bank of China", 39.9042, 116.4074)
    ]
  },
  infrastructure: {
    datacenters: [
      point("dc-1", "Ashburn Data Center Corridor", 39.0438, -77.4874),
      point("dc-2", "Dallas Data Center Corridor", 32.7767, -96.797),
      point("dc-3", "Frankfurt Data Center Cluster", 50.1109, 8.6821),
      point("dc-4", "Northern Virginia Hyperscale Belt", 39.1, -77.5),
      point("dc-5", "Phoenix Data Center Cluster", 33.4484, -112.074),
      point("dc-6", "Amsterdam AMS-IX Cluster", 52.3676, 4.9041),
      point("dc-7", "Singapore Data Center Cluster", 1.3521, 103.8198),
      point("dc-8", "Tokyo Bay Data Center Belt", 35.6762, 139.6503)
    ],
    supplyChains: [
      point("sc-1", "Port of Los Angeles", 33.7361, -118.261),
      point("sc-2", "Port of Rotterdam", 51.95, 4.14),
      point("sc-3", "Port of Singapore", 1.2644, 103.8201),
      point("sc-4", "Port of Shanghai", 31.2304, 121.4737),
      point("sc-5", "Port of Long Beach", 33.7701, -118.1937),
      point("sc-6", "Port of Busan", 35.1796, 129.0756),
      point("sc-7", "Port of Jebel Ali", 25.0657, 55.1713),
      point("sc-8", "Port of Antwerp-Bruges", 51.2602, 4.4028)
    ],
    energySites: [
      point("en-1", "Permian Basin Node", 31.9686, -102.0779),
      point("en-2", "North Sea Platform Cluster", 57.5, 1.5),
      point("en-3", "Qatar LNG Complex", 25.6, 51.5),
      point("en-4", "Ghawar Field Infrastructure", 25.0, 49.5),
      point("en-5", "US Gulf LNG Cluster", 29.4, -94.9),
      point("en-6", "Alberta Oil Sands Hub", 56.7264, -111.379),
      point("en-7", "Itaipu Hydro Complex", -25.4068, -54.5882),
      point("en-8", "Three Gorges Energy Complex", 30.823, 111.003)
    ],
    submarineCables: [
      point("cab-1", "Marea Landing - Virginia Beach", 36.8529, -75.978),
      point("cab-2", "Amitie Landing - Le Porge", 44.893, -1.212),
      point("cab-3", "SEA-ME-WE Landing - Marseille", 43.2965, 5.3698),
      point("cab-4", "PACRIM Landing - Guam", 13.4443, 144.7937),
      point("cab-5", "Equiano Landing - Lagos", 6.5244, 3.3792)
    ],
    outages: [
      { id: "out-1", name: "Regional ISP outage", lat: 34.0522, lon: -118.2437, severity: "medium" },
      { id: "out-2", name: "Grid instability event", lat: 35.2271, lon: -80.8431, severity: "high" },
      { id: "out-3", name: "Metro datacenter cooling event", lat: 41.8781, lon: -87.6298, severity: "medium" },
      { id: "out-4", name: "Substation trip event", lat: 47.6062, lon: -122.3321, severity: "low" }
    ]
  },
  environmental: {
    volcanoes: [
      point("vol-1", "Kilauea", 19.421, -155.287),
      point("vol-2", "Etna", 37.751, 14.993),
      point("vol-3", "Popocatepetl", 19.023, -98.622),
      point("vol-4", "Merapi", -7.5407, 110.4461),
      point("vol-5", "Sakurajima", 31.5852, 130.6577),
      point("vol-6", "Fuego", 14.4746, -90.8808)
    ],
    fires: [
      point("fire-1", "Wildfire hotspot", 34.4, -119.7, { confidence: "high" }),
      point("fire-2", "Wildfire hotspot", -33.8688, 151.2093, { confidence: "medium" }),
      point("fire-3", "Wildfire hotspot", 45.52, -122.6819, { confidence: "medium" }),
      point("fire-4", "Wildfire hotspot", 36.7783, -119.4179, { confidence: "high" })
    ],
    weather: [
      point("wx-1", "Severe storm cell", 29.7604, -95.3698),
      point("wx-2", "Cyclone watch", 15.5, -61.2),
      point("wx-3", "Heatwave corridor", 28.6139, 77.209),
      point("wx-4", "Flood risk corridor", 23.8103, 90.4125)
    ],
    earthquakeFaults: [
      point("eqf-1", "San Andreas Segment", 35.12, -119.65),
      point("eqf-2", "Anatolian Fault Segment", 40.9, 29.2),
      point("eqf-3", "Japan Trench Segment", 38.2, 142.6),
      point("eqf-4", "Andean Subduction Segment", -20.2, -70.1)
    ]
  }
};

export const categoryList = ["geopolitical", "finance", "infrastructure", "environmental"];
