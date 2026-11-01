import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { 
  MapPin, 
  Layers, 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Filter, 
  Info, 
  ChevronLeft, 
  Compass, 
  Maximize2,
  RefreshCw,
  Building,
  Ruler
} from 'lucide-react';

export default function GISMapView() {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFarm, setSelectedFarm] = useState(null);
  const [filterDistrict, setFilterDistrict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchGISData();
  }, []);

  const fetchGISData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/gis/farms/', {
        headers: {
          'Authorization': `Token ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to load GIS spatial boundary data.');
      }
      const data = await response.json();
      setFarms(data.features || []);
    } catch (err) {
      console.error(err);
      // Fallback mock features if offline/unauthenticated
      setFarms([
        {
          id: 1,
          properties: {
            application_id: 1,
            reference_number: "APP-00001",
            farm_name: "Mazowe Citrus Estate Plot A",
            farmer_name: "Tendai Moyo",
            district: "Mazowe",
            province: "Mashonaland Central",
            size_hectares: "45.50",
            status: "SURVEYED",
            has_disputes: false
          },
          geometry: {
            coordinates: [[ [31.05, -17.82], [31.08, -17.82], [31.08, -17.85], [31.05, -17.85], [31.05, -17.82] ]]
          }
        },
        {
          id: 2,
          properties: {
            application_id: 2,
            reference_number: "APP-00002",
            farm_name: "Goromonzi Enterprise Farm",
            farmer_name: "Blessing Chidhakwa",
            district: "Goromonzi",
            province: "Mashonaland East",
            size_hectares: "120.00",
            status: "ZLC_VERIFIED",
            has_disputes: true
          },
          geometry: {
            coordinates: [[ [31.25, -17.75], [31.30, -17.75], [31.30, -17.80], [31.25, -17.80], [31.25, -17.75] ]]
          }
        },
        {
          id: 3,
          properties: {
            application_id: 3,
            reference_number: "APP-00003",
            farm_name: "Zvimba Agricultural Lot 14",
            farmer_name: "Farai Nyathi",
            district: "Zvimba",
            province: "Mashonaland West",
            size_hectares: "88.20",
            status: "VALUATED",
            has_disputes: false
          },
          geometry: {
            coordinates: [[ [30.85, -17.65], [30.90, -17.65], [30.90, -17.70], [30.85, -17.70], [30.85, -17.65] ]]
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredFarms = farms.filter(f => {
    const props = f.properties;
    const matchesDistrict = filterDistrict === 'ALL' || props.district === filterDistrict;
    const matchesSearch = searchQuery === '' || 
      props.farm_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      props.reference_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      props.farmer_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDistrict && matchesSearch;
  });

  const districts = ['ALL', ...Array.from(new Set(farms.map(f => f.properties.district)))];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <RouterLink to="/officer" className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5 text-sm">
            <ChevronLeft className="w-4 h-4" /> Officer Dashboard
          </RouterLink>
          <div className="h-4 w-px bg-slate-800"></div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            GIS Land Boundary & Overlap Inspection Portal
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchGISData}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Map Data
          </button>
        </div>
      </header>

      {/* Main Workspace Layout: Left Sidebar + Map View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Control & Search Panel */}
        <aside className="w-full md:w-80 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto shrink-0 z-10">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Search Farm Plots
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Farm name, Ref #, Farmer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Filter District
            </label>
            <select
              value={filterDistrict}
              onChange={(e) => setFilterDistrict(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {districts.map(d => (
                <option key={d} value={d}>{d === 'ALL' ? 'All Districts' : d}</option>
              ))}
            </select>
          </div>

          {/* Spatial Overlap Conflict Summary */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            <div className="flex items-center gap-2 font-semibold text-amber-300 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              Boundary Conflict Radar
            </div>
            <p className="text-amber-200/80 leading-relaxed">
              Plots highlighted in red indicate flagged title deed overlaps or boundary disputes. Click any plot polygon to inspect coordinates.
            </p>
          </div>

          {/* Farm Plots List */}
          <div className="flex-1 space-y-2 mt-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Farm Plots ({filteredFarms.length})</span>
              <Layers className="w-3.5 h-3.5 text-slate-500" />
            </div>

            {filteredFarms.map((farm) => {
              const p = farm.properties;
              const isSelected = selectedFarm?.properties.application_id === p.application_id;

              return (
                <div
                  key={p.application_id}
                  onClick={() => setSelectedFarm(farm)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-emerald-500/15 border-emerald-500 text-gray-900 shadow-lg' 
                      : p.has_disputes 
                      ? 'bg-rose-500/10 border-rose-500/40 text-slate-200 hover:border-rose-500' 
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-gray-900 truncate">
                      {p.farm_name}
                    </h4>
                    {p.has_disputes && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold shrink-0">
                        Overlap
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>{p.farmer_name}</span>
                    <span className="font-mono">{p.size_hectares} ha</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                    <span className="font-mono text-emerald-400">{p.reference_number}</span>
                    <span>•</span>
                    <span>{p.district}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Spatial GIS Interactive Visualizer Canvas */}
        <main className="flex-1 bg-slate-950 relative overflow-hidden flex flex-col justify-center items-center p-6">
          {/* Map Grid Vector Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>

          {/* Interactive SVG GIS Map View */}
          <div className="relative w-full max-w-3xl aspect-video bg-slate-900/80 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col justify-between overflow-hidden">
            {/* GIS Overlay Legend */}
            <div className="flex items-center justify-between z-10">
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zimbabwe Cadastral Grid View</span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Verified Plot
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> Overlap / Query
                </span>
              </div>
            </div>

            {/* SVG Plot Representation */}
            <div className="flex-1 flex items-center justify-center my-4 relative">
              <svg className="w-full h-full max-h-80" viewBox="0 0 800 400" fill="none">
                {/* District boundary outline mock */}
                <rect x="50" y="30" width="700" height="340" rx="16" stroke="#334155" strokeWidth="2" strokeDasharray="6 6" fill="#0f172a" fillOpacity="0.5" />
                <text x="70" y="60" fill="#64748b" fontSize="12" fontWeight="bold">ZIMBABWE LAND SURVEY GRID (ZONE 36S)</text>

                {/* Plot 1 */}
                <g 
                  onClick={() => setSelectedFarm(farms[0])}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <polygon points="120,100 280,100 280,240 120,240" fill="#10b981" fillOpacity="0.25" stroke="#10b981" strokeWidth="3" />
                  <text x="140" y="140" fill="#a7f3d0" fontSize="12" fontWeight="bold">APP-00001</text>
                  <text x="140" y="160" fill="#6ee7b7" fontSize="10">Mazowe Estate (45.5 ha)</text>
                </g>

                {/* Plot 2 - Overlap Conflict */}
                <g 
                  onClick={() => setSelectedFarm(farms[1])}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <polygon points="260,180 440,180 440,320 260,320" fill="#f43f5e" fillOpacity="0.3" stroke="#f43f5e" strokeWidth="3" />
                  <text x="340" y="220" fill="#fecdd3" fontSize="12" fontWeight="bold">APP-00002</text>
                  <text x="340" y="240" fill="#fda4af" fontSize="10">OVERLAP FLAGGED (120 ha)</text>
                </g>

                {/* Plot 3 */}
                <g 
                  onClick={() => setSelectedFarm(farms[2])}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <polygon points="500,120 680,120 680,260 500,260" fill="#3b82f6" fillOpacity="0.25" stroke="#3b82f6" strokeWidth="3" />
                  <text x="520" y="160" fill="#bfdbfe" fontSize="12" fontWeight="bold">APP-00003</text>
                  <text x="520" y="180" fill="#93c5fd" fontSize="10">Zvimba Lot 14 (88.2 ha)</text>
                </g>
              </svg>
            </div>

            {/* Bottom Coordinates & Scale Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
              <span>Center: 17.8216° S, 31.0492° E</span>
              <span>Surveyor General Projection: WGS 84 / UTM Zone 36S</span>
            </div>
          </div>

          {/* Selected Farm Detail Drawer / Card */}
          {selectedFarm && (
            <div className="absolute bottom-6 right-6 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 shadow-2xl z-20 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                    {selectedFarm.properties.reference_number}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 mt-0.5">
                    {selectedFarm.properties.farm_name}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedFarm(null)}
                  className="text-gray-600 hover:text-gray-900 text-xs font-bold px-1.5 py-0.5"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Farmer</span>
                  <span className="font-semibold text-slate-200">{selectedFarm.properties.farmer_name}</span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Hectarage</span>
                  <span className="font-semibold text-slate-200">{selectedFarm.properties.size_hectares} ha</span>
                </div>
              </div>

              <div className="text-xs space-y-1 pt-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">District:</span>
                  <span>{selectedFarm.properties.district}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Province:</span>
                  <span>{selectedFarm.properties.province}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Workflow Status:</span>
                  <span className="font-semibold text-emerald-400">{selectedFarm.properties.status}</span>
                </div>
              </div>

              {selectedFarm.properties.has_disputes && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Overlap Conflict Detected with adjacent plot boundary.</span>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
