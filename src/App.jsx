import React, { useState, useEffect } from 'react';
import { 
  Thermometer, Droplets, Sun, Wind, Cpu, Sliders, Lock, Sprout, RefreshCw, Eye
} from 'lucide-react';
import Chart from 'react-apexcharts';
import { supabase } from './supabaseClient';

function App() {
  // Avtorizatsiya holati
  const [authState, setAuthState] = useState({ isLoading: true, isAllowed: false, hasCrop: false, selectedCrop: '' });
  
  // Real-time datchiklar holati
  const [climate, setClimate] = useState({ 
    air_temp: '--.-', air_hum: '--', soil_hum: '--', light_level: '--', gas_level: '----' 
  });
  
  // Avtomatika va Me'yorlar
  const [settings, setSettings] = useState({ 
    max_temp: 28.0, min_soil_hum: 40, max_gas: 300, fan_status: false, pump_status: false 
  });
  
  const [tgUser, setTgUser] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('Yuklanmoqda...');
  const [logs, setLogs] = useState([]);
  
  // Har bir datchik uchun alohida tarixiy ma'lumotlar massivi
  const [chartData, setChartData] = useState({
    categories: [],
    temp: [],
    hum: [],
    soil: [],
    light: [],
    gas: []
  });

  // Hardware Simulator holatlari
  const [simTemp, setSimTemp] = useState(24.5);
  const [simHum, setSimHum] = useState(62);
  const [simSoil, setSimSoil] = useState(45);
  const [simLight, setSimLight] = useState(70);
  const [simGas, setSimGas] = useState(450);
  const [isSimulating, setIsSimulating] = useState(false);

  const addLog = (message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [`[${time}] ${message}`, ...prev.slice(0, 4)]);
  };

  // Tarixiy ma'lumotlarni yuklash va grafiklar uchun ajratish
  const fetchChartHistory = async () => {
    const { data } = await supabase.from('parnik_data').select('*').order('id', { ascending: false }).limit(10);
    if (data) {
      const reversed = [...data].reverse();
      const timeLabels = reversed.map(d => new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      
      setChartData({
        categories: timeLabels,
        temp: reversed.map(d => d.air_temp),
        hum: reversed.map(d => d.air_hum),
        soil: reversed.map(d => d.soil_hum),
        light: reversed.map(d => d.light_level),
        gas: reversed.map(d => d.gas_level)
      });
    }
  };

  useEffect(() => {
    let channel;

    const checkUserAccess = async () => {
      addLog("Tizim tekshirilmoqda...");
      if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
          const user = tg.initDataUnsafe.user;
          setTgUser(user);

          const { data: dbUser } = await supabase.from('users').select('*').eq('telegram_id', user.id).maybeSingle();

          if (dbUser && dbUser.is_allowed) {
            setAuthState({ 
              isLoading: false, 
              isAllowed: true, 
              hasCrop: !!dbUser.selected_crop, 
              selectedCrop: dbUser.selected_crop || '' 
            });
            await fetchInitialData();
            await fetchSettings();
            await fetchChartHistory();
            setupRealtime(); 
          } else {
            setAuthState({ isLoading: false, isAllowed: false, hasCrop: false, selectedCrop: '' });
          }
        } else {
          setDefaultAccess();
        }
      } else {
        setDefaultAccess();
      }
    };

    const setDefaultAccess = async () => {
      setAuthState({ isLoading: false, isAllowed: true, hasCrop: true, selectedCrop: 'pomidor' });
      await fetchInitialData();
      await fetchSettings();
      await fetchChartHistory();
      setupRealtime();
    };

    const fetchInitialData = async () => {
      const { data } = await supabase.from('parnik_data').select('*').order('id', { ascending: false }).limit(1);
      if (data && data.length > 0) {
        setClimate(data[0]);
        setSimTemp(data[0].air_temp);
        setSimHum(data[0].air_hum);
        setSimSoil(data[0].soil_hum);
        setSimLight(data[0].light_level || 50);
        setSimGas(data[0].gas_level || 400);
        setLastUpdated(new Date(data[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        addLog("Datchiklarning joriy holati yuklandi.");
      }
    };

    const fetchSettings = async () => {
      const { data } = await supabase.from('parnik_settings').select('*').eq('id', 1).maybeSingle();
      if (data) setSettings(data);
    };

    const setupRealtime = () => {
      channel = supabase.channel('greenhouse-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parnik_data' }, payload => {
          // Kartochkalarni real-time yangilash
          setClimate(payload.new);
          setLastUpdated(new Date(payload.new.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          addLog(`⚡ Yangi paket: T: ${payload.new.air_temp}°C | Tuproq: ${payload.new.soil_hum}% | Yorug'lik: ${payload.new.light_level}%`);
          
          // Grafiklar tarixini qayta yuklash va yangilash
          fetchChartHistory(); 
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parnik_settings' }, payload => {
          setSettings(payload.new);
          addLog(`⚙️ Rele statusi yangilandi.`);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') addLog("🟢 Real-time oqim faol.");
        });
    };

    checkUserAccess();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleSimulatorSubmit = async () => {
    setIsSimulating(true);
    addLog("Simulyatordan ma'lumot jo'natilmoqda...");
    try {
      await supabase.from('parnik_data').insert([{
        air_temp: parseFloat(simTemp),
        air_hum: parseFloat(simHum),
        soil_hum: parseFloat(simSoil),
        light_level: parseInt(simLight),
        gas_level: parseInt(simGas)
      }]);
      addLog("🚀 Simulyatsiya ma'lumotlari muvaffaqiyatli insert qilindi.");
    } catch (err) {
      console.error(err);
      addLog("❌ Xatolik yuz berdi.");
    } finally {
      setIsSimulating(false);
    }
  };

  const updateGreenhouseSettings = async (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    await supabase.from('parnik_settings').update({ [field]: value }).eq('id', 1);
  };

  // Umumiy grafik sozlamalarini generatsiya qiluvchi funksiya
  const getChartOptions = (id, color) => ({
    chart: { id: id, toolbar: { show: false }, background: 'transparent', sparkline: { enabled: false } },
    colors: [color],
    stroke: { curve: 'smooth', width: 2.5 },
    grid: { borderColor: '#1e293b', strokeDashArray: 3, padding: { left: 10, right: 10 } },
    theme: { mode: 'dark' },
    xaxis: { categories: chartData.categories, labels: { style: { colors: '#64748b', fontSize: '8px' } } },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: '8px' } } },
    legend: { show: false }
  });

  if (authState.isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-3">
        <RefreshCw size={24} className="animate-spin text-indigo-500" />
        <span>Parnik ekotizimi yuklanmoqda...</span>
      </div>
    );
  }

  if (!authState.isAllowed) {
    return (
      <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center text-slate-400 p-6 text-center font-sans gap-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full"><Lock size={32} /></div>
        <h2 className="text-white font-bold text-lg">Kirish Rad Etildi</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 font-sans pb-10">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-[#0f1626] p-4 rounded-xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400"><Cpu size={20} /></div>
            <div>
              <h1 className="text-xs font-bold uppercase tracking-wider text-white">SMART GREENHOUSE V2</h1>
              <p className="text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live Monitoring Active
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-indigo-950 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-900/50 font-mono">
            {tgUser ? `${tgUser.first_name} (${authState.selectedCrop})` : `Admin Mode (${authState.selectedCrop})`}
          </span>
        </header>

        {/* 🌡 REAL-TIME DATCHIK KARTALARI */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 relative shadow-md">
            <div className="absolute top-3 right-3 text-orange-500"><Thermometer size={16} /></div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Havo Harorati</p>
            <p className="text-2xl font-mono font-black mt-1 text-white">{climate.air_temp} <span className="text-xs text-orange-400">°C</span></p>
            <p className="text-[8px] text-slate-500 mt-2 font-mono">Limit: &lt;{settings.max_temp}°C</p>
          </div>

          <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 relative shadow-md">
            <div className="absolute top-3 right-3 text-cyan-400"><Droplets size={16} /></div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Havo Namligi</p>
            <p className="text-2xl font-mono font-black mt-1 text-white">{climate.air_hum} <span className="text-xs text-cyan-400">%</span></p>
            <p className="text-[8px] text-emerald-500 mt-2 font-mono">DHT11 Live</p>
          </div>

          <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 relative shadow-md">
            <div className="absolute top-3 right-3 text-emerald-400"><Sprout size={16} /></div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Tuproq Namligi</p>
            <p className="text-2xl font-mono font-black mt-1 text-white">{climate.soil_hum} <span className="text-xs text-emerald-400">%</span></p>
            <p className="text-[8px] text-slate-500 mt-2 font-mono">Min Limit: {settings.min_soil_hum}%</p>
          </div>

          <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 relative shadow-md">
            <div className="absolute top-3 right-3 text-yellow-400"><Sun size={16} /></div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Yorug'lik Darajasi</p>
            <p className="text-2xl font-mono font-black mt-1 text-white">{climate.light_level} <span className="text-xs text-yellow-400">%</span></p>
            <p className="text-[8px] text-slate-500 mt-2 font-mono">Ambient Photo</p>
          </div>

          <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 relative shadow-md col-span-2 lg:col-span-1">
            <div className="absolute top-3 right-3 text-rose-400"><Wind size={16} /></div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gaz miqdori</p>
            <p className="text-2xl font-mono font-black mt-1 text-white">{climate.gas_level} <span className="text-xs text-rose-400">ppm</span></p>
            <p className="text-[8px] text-slate-500 mt-2 font-mono">MQ-135 Air</p>
          </div>
        </section>

        {/* 📊 5 TA ALOHIDA GRAFIKLAR PANELI */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">📈 DATCHIKLARNING ALOHIDA DINAMIK GRAFIKLARI</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Harorat Grafik */}
            <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 shadow-md">
              <h4 className="text-[10px] font-mono font-bold text-orange-400 mb-2 uppercase">Havo Harorati (°C)</h4>
              <div className="h-44">
                <Chart options={getChartOptions('temp-chart', '#f97316')} series={[{ name: 'Harorat', data: chartData.temp }]} type="line" height="100%" />
              </div>
            </div>

            {/* 2. Havo Namligi Grafik */}
            <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 shadow-md">
              <h4 className="text-[10px] font-mono font-bold text-cyan-400 mb-2 uppercase">Havo Namligi (%)</h4>
              <div className="h-44">
                <Chart options={getChartOptions('hum-chart', '#22d3ee')} series={[{ name: 'Havo Namligi', data: chartData.hum }]} type="line" height="100%" />
              </div>
            </div>

            {/* 3. Tuproq Namligi Grafik */}
            <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 shadow-md">
              <h4 className="text-[10px] font-mono font-bold text-emerald-400 mb-2 uppercase">Tuproq Namligi (%)</h4>
              <div className="h-44">
                <Chart options={getChartOptions('soil-chart', '#10b981')} series={[{ name: 'Tuproq Namligi', data: chartData.soil }]} type="line" height="100%" />
              </div>
            </div>

            {/* 4. Yorug'lik Grafik */}
            <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 shadow-md">
              <h4 className="text-[10px] font-mono font-bold text-yellow-400 mb-2 uppercase">Yorug'lik Darajasi (%)</h4>
              <div className="h-44">
                <Chart options={getChartOptions('light-chart', '#eab308')} series={[{ name: 'Yorug\'lik', data: chartData.light }]} type="line" height="100%" />
              </div>
            </div>

            {/* 5. Gaz Grafik */}
            <div className="bg-[#0f1626] p-3 rounded-xl border border-slate-800 shadow-md md:col-span-2 lg:col-span-1">
              <h4 className="text-[10px] font-mono font-bold text-rose-400 mb-2 uppercase">Gaz Miqdori (ppm)</h4>
              <div className="h-44">
                <Chart options={getChartOptions('gas-chart', '#f43f5e')} series={[{ name: 'Gaz (ppm)', data: chartData.gas }]} type="line" height="100%" />
              </div>
            </div>
          </div>
        </section>

        {/* Boshqaruv va Hardware Simulator panellari */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0f1626] p-4 rounded-xl border border-slate-800 space-y-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Sliders size={14} className="text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Avtomatika va Me'yoriy Sozlamalar</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div>
                <div className="flex justify-between font-mono mb-1"><span className="text-slate-400">Maks Temp:</span> <span className="text-orange-400 font-bold">{settings.max_temp}°C</span></div>
                <input type="range" min="15" max="40" step="0.5" value={settings.max_temp} onChange={e => updateGreenhouseSettings('max_temp', parseFloat(e.target.value))} className="w-full accent-orange-500 h-1 bg-slate-800" />
              </div>
              <div>
                <div className="flex justify-between font-mono mb-1"><span className="text-slate-400">Min Tuproq:</span> <span className="text-emerald-400 font-bold">{settings.min_soil_hum}%</span></div>
                <input type="range" min="10" max="90" step="1" value={settings.min_soil_hum} onChange={e => updateGreenhouseSettings('min_soil_hum', parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-slate-800" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2">
              <button onClick={() => updateGreenhouseSettings('fan_status', !settings.fan_status)} className={`p-3 rounded-lg border flex justify-between items-center transition-all ${settings.fan_status ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold shadow-lg' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
                <div className="flex items-center gap-1.5">
                  <Wind size={12} className={settings.fan_status ? "animate-spin" : ""} />
                  <span>Ventilyator (Kuller)</span>
                </div>
                <span className="text-xs font-black">{settings.fan_status ? 'ON' : 'OFF'}</span>
              </button>
              
              <button onClick={() => updateGreenhouseSettings('pump_status', !settings.pump_status)} className={`p-3 rounded-lg border flex justify-between items-center transition-all ${settings.pump_status ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold shadow-lg' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
                <div className="flex items-center gap-1.5">
                  <Droplets size={12} className={settings.pump_status ? "animate-bounce" : ""} />
                  <span>Suv Nasosi</span>
                </div>
                <span className="text-xs font-black">{settings.pump_status ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          {/* Hardware Simulator */}
          <div className="bg-[#0f1626] p-4 rounded-xl border border-slate-800 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">ESP32 HARDWARE SIMULATOR PANEL</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-mono">
                <div>
                  <div className="flex justify-between mb-0.5"><span className="text-slate-400">Harorat:</span><span className="text-orange-400 font-bold">{simTemp}°C</span></div>
                  <input type="range" min="15" max="45" step="0.5" value={simTemp} onChange={e => setSimTemp(parseFloat(e.target.value))} className="w-full accent-orange-500 h-1 bg-slate-800" />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5"><span className="text-slate-400">Tuproq namligi:</span><span className="text-emerald-400 font-bold">{simSoil}%</span></div>
                  <input type="range" min="0" max="100" step="1" value={simSoil} onChange={e => setSimSoil(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-slate-800" />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5"><span className="text-slate-400">Yorug'lik:</span><span className="text-yellow-400 font-bold">{simLight}%</span></div>
                  <input type="range" min="0" max="100" step="1" value={simLight} onChange={e => setSimLight(parseInt(e.target.value))} className="w-full accent-yellow-400 h-1 bg-slate-800" />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5"><span className="text-slate-400">Gaz (MQ-135):</span><span className="text-rose-400 font-bold">{simGas} ppm</span></div>
                  <input type="range" min="100" max="4095" step="5" value={simGas} onChange={e => setSimGas(parseInt(e.target.value))} className="w-full accent-rose-500 h-1 bg-slate-800" />
                </div>
              </div>
            </div>
            <button disabled={isSimulating} onClick={handleSimulatorSubmit} className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900/50 text-white font-mono text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]">
              {isSimulating ? <RefreshCw size={12} className="animate-spin" /> : <Eye size={12} />}
              🚀 IoT Sensor Ma'lumotini Insert Qilish
            </button>
          </div>
        </section>

        {/* Real-Time Logs */}
        <section className="bg-[#0f1626] p-4 rounded-xl border border-slate-800 shadow-inner">
          <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 mb-2">💻 Real-Time Tizim Loglari</h4>
          <div className="font-mono text-[10px] text-slate-500 space-y-1">
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">[00:00:00] Tizim oqimi barqaror...</p>
            ) : (
              logs.map((log, index) => <p key={index} className={index === 0 ? "text-indigo-400 font-semibold" : ""}>{log}</p>)
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

export default App;