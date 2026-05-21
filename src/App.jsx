import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Sun, 
  Wind, 
  Spade, 
  Cpu, 
  Terminal, 
  Sliders, 
  Send,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { supabase } from './supabaseClient';

function App() {
  // 5 ta datchik uchun real-time holat
// 5 ta datchik uchun real-time holat
  const [climate, setClimate] = useState({
    air_temp: '--.-',      // <-- Qo'shtirnoq ichiga olindi
    air_hum: '--',         // <-- Qo'shtirnoq ichiga olindi
    light_level: '----',   // <-- Qo'shtirnoq ichiga olindi
    gas_level: '----',     // <-- Qo'shtirnoq ichiga olindi
    soil_hum: '--'         // <-- Qo'shtirnoq ichiga olindi
  });

  // Me'yoriy sozlamalar va Relelar holati
  const [settings, setSettings] = useState({
    max_temp: 28.0,
    min_soil_hum: 40,
    max_gas: 400,
    fan_status: false,
    pump_status: false
  });

  // IoT Simulator uchun vaqtincha slajder holatlari
  const [simData, setSimData] = useState({ air_temp: 24.5, air_hum: 62, light_level: 2150, gas_level: 320, soil_hum: 45 });

  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tgUser, setTgUser] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('Yuklanmoqda...');

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ id: Date.now(), time, msg }, ...prev]);
  };

  useEffect(() => {
    // 1. Telegram Mini App sozlamasi
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        setTgUser(tg.initDataUnsafe.user);
      }
    }

    // 2. Dastlabki datchik ma'lumotlarini yuklash (Oxirgi 15 ta)
    const fetchInitialData = async () => {
      addLog('Datchiklar tarixi yuklanmoqda...');
      const { data, error } = await supabase
        .from('parnik_data')
        .select('*')
        .order('id', { ascending: false })
        .limit(15);

      if (error) addLog(`Xatolik: ${error.message}`);
      else if (data && data.length > 0) {
        const reversed = data.reverse();
        const latest = reversed[reversed.length - 1];
        setClimate(latest);
        setSimData({
          air_temp: latest.air_temp,
          air_hum: latest.air_hum,
          light_level: latest.light_level,
          gas_level: latest.gas_level,
          soil_hum: latest.soil_hum
        });
        
        setHistory(reversed.map(d => ({
          time: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          temp: d.air_temp,
          hum: d.air_hum,
          soil: d.soil_hum
        })));
        setLastUpdated(new Date(latest.created_at).toLocaleTimeString());
        addLog('Datchiklar muvaffaqiyatli yuklandi.');
      }
    };

    // 3. Me'yoriy sozlamalarni yuklash (ID: 1)
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('parnik_settings')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (!error && data) setSettings(data);
    };

    fetchInitialData();
    fetchSettings();

    // 4. REALTIME TINGLOVCHILAR (parnik_data va parnik_settings uchun)
    const dataChannel = supabase
      .channel('db-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parnik_data' }, (payload) => {
        const newData = payload.new;
        setClimate(newData);
        setHistory(prev => {
          const updated = [...prev, { 
            time: new Date(newData.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            temp: newData.air_temp, 
            hum: newData.air_hum,
            soil: newData.soil_hum
          }];
          if (updated.length > 15) updated.shift();
          return updated;
        });
        setLastUpdated(new Date(newData.created_at).toLocaleTimeString());
        addLog(`Yangi ma'lumot keldi: T:${newData.air_temp}°C, Tuproq:${newData.soil_hum}%`);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parnik_settings' }, (payload) => {
        setSettings(payload.new);
        addLog(`Tizim sozlamalari yoki aktuatorlar yangilandi.`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dataChannel);
    };
  }, []);

  // Me'yoriy sozlamalarni o'zgartirganda bazaga yuborish mantiqi
  const updateTargetSettings = async (field, value) => {
    const updatedFields = { ...settings, [field]: value };
    setSettings(updatedFields); // Interfeys tez ishlashi uchun darhol yangilaymiz

    const { error } = await supabase
      .from('parnik_settings')
      .update({ [field]: value })
      .eq('id', 1);

    if (error) addLog(`Sozlamani saqlashda xato: ${error.message}`);
  };

  // IoT Simulator: Haqiqiy ESP32 simulyatsiyasi (Bazaga yozadi)
  const handleSimulateSend = async () => {
    addLog('Simulyatordan ma’lumot yuborilmoqda...');
    const { error } = await supabase
      .from('parnik_data')
      .insert([
        { 
          air_temp: simData.air_temp, 
          air_hum: simData.air_hum, 
          light_level: simData.light_level, 
          gas_level: simData.gas_level, 
          soil_hum: simData.soil_hum 
        }
      ]);

    if (error) addLog(`Xato: ${error.message}`);
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 font-sans px-4 py-4 sm:px-6 lg:px-8 pb-10 max-w-6xl mx-auto select-none">
      
      {/* 🔵 HEADER */}
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-5 bg-[#0f1626]/80 backdrop-blur-md p-4 rounded-2xl border border-slate-800/60 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <Cpu size={20} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white uppercase">Smart Greenhouse v2</h1>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              ESP32 real-time monitoring
            </p>
          </div>
        </div>
        <span className="w-full sm:w-auto text-left sm:text-right text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/40 font-medium">
          {tgUser ? tgUser.first_name : 'Mening Parnigim'}
        </span>
      </header>

      {/* 📊 SENSOR KO'RSATKICHLARI */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">
        <div className="bg-[#0f1626]/60 p-3 rounded-xl border border-slate-800/60 flex flex-col justify-between h-24">
          <div className="flex justify-between items-center text-orange-400"><span className="text-[9px] font-bold text-slate-400 uppercase">Havo Temp</span><Thermometer size={14} /></div>
          <div><span className="text-xl font-black text-white font-mono">{climate.air_temp}</span><span className="text-xs font-bold text-orange-400 ml-0.5">°C</span></div>
          <span className="text-[8px] text-slate-500">Meyor: &lt;{settings.max_temp}°C</span>
        </div>

        <div className="bg-[#0f1626]/60 p-3 rounded-xl border border-slate-800/60 flex flex-col justify-between h-24">
          <div className="flex justify-between items-center text-cyan-400"><span className="text-[9px] font-bold text-slate-400 uppercase">Havo Namlik</span><Droplets size={14} /></div>
          <div><span className="text-xl font-black text-white font-mono">{climate.air_hum}</span><span className="text-xs font-bold text-cyan-400 ml-0.5">%</span></div>
          <span className="text-[8px] text-emerald-400">DHT11 datchik</span>
        </div>

        <div className="bg-[#0f1626]/60 p-3 rounded-xl border border-slate-800/60 flex flex-col justify-between h-24">
          <div className="flex justify-between items-center text-emerald-400"><span className="text-[9px] font-bold text-slate-400 uppercase">Tuproq Namlik</span><Spade size={14} /></div>
          <div><span className="text-xl font-black text-white font-mono">{climate.soil_hum}</span><span className="text-xs font-bold text-emerald-400 ml-0.5">%</span></div>
          <span className="text-[8px] text-slate-500">Min me'yor: {settings.min_soil_hum}%</span>
        </div>
      </section>

      {/* 📊 QO'SHIMCHA SENSORLAR (YORUGLIK VA GAZ) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0f1626]/40 p-3 rounded-xl border border-slate-800/50 flex justify-between items-center">
          <div className="flex items-center gap-2"><Sun size={16} className="text-amber-400" /><div className="text-[10px]"><p className="text-slate-400">Yorug'lik</p><p className="font-bold font-mono">{climate.light_level} lx</p></div></div>
          <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">Ambient</span>
        </div>
        <div className="bg-[#0f1626]/40 p-3 rounded-xl border border-slate-800/50 flex justify-between items-center">
          <div className="flex items-center gap-2"><Wind size={16} className="text-violet-400" /><div className="text-[10px]"><p className="text-slate-400">Havo Tozaligi</p><p className="font-bold font-mono">{climate.gas_level} PPM</p></div></div>
          <span className={`text-[8px] px-1.5 py-0.5 rounded ${climate.gas_level > settings.max_gas ? 'bg-red-500/20 text-red-400' : 'bg-violet-500/10 text-violet-400'}`}>MQ-7</span>
        </div>
      </section>

      {/* 📈 GRAFIK */}
      <section className="bg-[#0f1626]/70 p-4 rounded-2xl border border-slate-800/60 mb-4 shadow-md">
        <h3 className="text-xs font-bold text-slate-200 mb-3">Harorat va Tuproq Namligi Dinamikasi</h3>
        <div className="w-full h-48 sm:h-56 md:h-64 font-mono text-[9px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <XAxis dataKey="time" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip contentStyle={{ backgroundColor: '#0f1626', borderColor: '#334155', color: '#fff' }} />
              <Area type="monotone" dataKey="temp" name="Harorat" stroke="#f97316" fillOpacity={0.05} fill="#f97316" />
              <Area type="monotone" dataKey="soil" name="Tuproq namligi" stroke="#10b981" fillOpacity={0.05} fill="#10b981" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 🎛️ AKTUAL SOZLAMALAR VA RELE STATUSI */}
      <section className="bg-[#0f1626]/80 p-4 rounded-2xl border border-indigo-500/20 mb-4 space-y-3 shadow-xl">
        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400"><Sliders size={14} /><span>Avtomatika va Me'yoriy Sozlamalar</span></div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Harorat Me'yori */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between font-mono"><span>Maks Harorat:</span><span className="text-orange-400 font-bold">{settings.max_temp}°C</span></div>
            <input type="range" min="20" max="35" step="0.5" value={settings.max_temp} onChange={(e) => updateTargetSettings('max_temp', parseFloat(e.target.value))} className="w-full accent-orange-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
          </div>
          {/* Tuproq Namlik Me'yori */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between font-mono"><span>Min Tuproq:</span><span className="text-emerald-400 font-bold">{settings.min_soil_hum}%</span></div>
            <input type="range" min="20" max="80" step="1" value={settings.min_soil_hum} onChange={(e) => updateTargetSettings('min_soil_hum', parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>

        {/* Relelar joriy holati (ESP32 tomonidan qaytarilgan holat) */}
        <div className="flex flex-col gap-3 pt-2 border-t border-slate-800 text-[10px] sm:flex-row">
          <div className="flex-1 flex items-center justify-between p-2 bg-slate-900/50 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">Ventilyator (Kuller)</span>
            {settings.fan_status ? <ToggleRight className="text-emerald-400" size={20} /> : <ToggleLeft className="text-slate-600" size={20} />}
          </div>
          <div className="flex-1 flex items-center justify-between p-2 bg-slate-900/50 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">Sug'orish (Nasos)</span>
            {settings.pump_status ? <ToggleRight className="text-emerald-400" size={20} /> : <ToggleLeft className="text-slate-600" size={20} />}
          </div>
        </div>
      </section>

      {/* 📑 JURNAL VA SIMULATOR */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-[#0f1626]/50 p-3 rounded-xl border border-slate-800/60 flex flex-col justify-between h-48">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 text-[10px] font-bold text-slate-300">
            <div className="flex items-center gap-1"><Terminal size={12} className="text-indigo-400" /><span>Tizim Jurnali</span></div>
          </div>
          <div className="flex-1 my-2 overflow-y-auto font-mono text-[8px] text-slate-400 custom-scrollbar space-y-1">
            {logs.map(log => (<div key={log.id}><span className="text-slate-600">[{log.time}]</span> {log.msg}</div>))}
          </div>
          <span className="text-[8px] text-slate-600 font-mono">Yangilanish: {lastUpdated}</span>
        </div>

        <div className="bg-[#0f1626]/80 p-3 rounded-xl border border-slate-700/30 flex flex-col justify-between h-48 shadow-xl text-[9px]">
          <div className="space-y-1.5">
            <p className="font-bold text-slate-300 uppercase text-[8px]">ESP32 / IoT Simulator</p>
            <div className="flex justify-between"><span>Temp/Namlik:</span><span className="text-slate-300 font-bold">{simData.air_temp}°C / {simData.air_hum}%</span></div>
            <input type="range" min="15" max="40" step="0.5" value={simData.air_temp} onChange={(e) => setSimData({...simData, air_temp: parseFloat(e.target.value)})} className="w-full accent-indigo-500 h-0.5 bg-slate-800" />
            
            <div className="flex justify-between"><span>Tuproq Namligi:</span><span className="text-emerald-400 font-bold">{simData.soil_hum}%</span></div>
            <input type="range" min="10" max="90" step="1" value={simData.soil_hum} onChange={(e) => setSimData({...simData, soil_hum: parseInt(e.target.value)})} className="w-full accent-emerald-500 h-0.5 bg-slate-800" />
          </div>
          <button onClick={handleSimulateSend} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded-lg text-[10px] font-bold font-sans flex items-center justify-center gap-1"><Send size={10} /><span>Baza yangilash</span></button>
        </div>
      </section>

    </div>
  );
}

export default App;