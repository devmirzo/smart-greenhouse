import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Thermometer, Droplets, Sun, Wind, Cpu, Lock, Sprout, RefreshCw, FileText, Activity
} from 'lucide-react';
import Chart from 'react-apexcharts';
import { supabase } from './supabaseClient';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ── KOMBINATSIYALANGAN UMUMIY GRAFIK KOMPONENTI ──
function MainOverviewChart({ history }) {
  const options = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      background: 'transparent',
      animations: { enabled: true, speed: 600 },
      redrawOnParentResize: true,
      redrawOnWindowResize: true
    },
    stroke: { curve: 'smooth', width: [3, 3, 2, 2, 2] },
    colors: ['#f97316', '#10b981', '#22d3ee', '#eab308', '#f43f5e'],
    grid: {
      borderColor: '#1e293b',
      strokeDashArray: 4,
      padding: { left: 10, right: 10 }
    },
    theme: { mode: 'dark' },
    xaxis: {
      categories: history.categories,
      labels: { style: { colors: '#475569', fontSize: '9px' } },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    // Multi-axis o'qlari: Chapda iqlim foizlari/harorat, O'ngda Gaz (ppm) o'lchovi
    yaxis: [
      {
        title: { text: "Iqlim / Namlik / Harorat", style: { color: '#22d3ee', fontSize: '10px', fontWeight: 600 } },
        labels: { style: { colors: '#64748b', fontSize: '9px' } }
      },
      {
        opposite: true,
        title: { text: "Gaz CO₂ (ppm)", style: { color: '#f43f5e', fontSize: '10px', fontWeight: 600 } },
        labels: { style: { colors: '#64748b', fontSize: '9px' } }
      }
    ],
    tooltip: { theme: 'dark', shared: true, intersect: false },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'center',
      labels: { colors: '#94a3b8', fontSize: '10px' },
      markers: { radius: 12 }
    },
    dataLabels: { enabled: false }
  };

  const series = [
    { name: "Harorat (°C)", type: 'line', data: history.temperature.length ? history.temperature : [0] },
    { name: "Tuproq namligi (%)", type: 'line', data: history.soil_moisture.length ? history.soil_moisture : [0] },
    { name: "Havo namligi (%)", type: 'line', data: history.humidity.length ? history.humidity : [0] },
    { name: "Yorug'lik (%)", type: 'line', data: history.light_level.length ? history.light_level : [0] },
    { name: "Gaz CO₂ (ppm)", type: 'area', data: history.gas_level.length ? history.gas_level : [0] }
  ];

  return (
    <div className="bg-[#0d1423] p-4 rounded-2xl border border-slate-800 w-full">
      <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
        📊 Umumiy Iqlim Balansi (Kombinatsiyalangan Grafik)
      </p>
      <div className="w-full h-[240px] sm:h-[280px]">
        <Chart options={options} series={series} type="line" height="100%" width="100%" />
      </div>
    </div>
  );
}

// ── ALOHIDA SENSOR KARTALARI UCHUN GRAFIK OPTIONLARI ──
function buildChartOptions(color, unit, categories) {
  return {
    chart: {
      toolbar: { show: false },
      background: 'transparent',
      animations: { enabled: true, speed: 800 },
      parentHeightOffset: 0,
      redrawOnParentResize: true, 
      redrawOnWindowResize: true
    },
    colors: [color],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark', type: 'vertical',
        shadeIntensity: 0.6,
        gradientToColors: ['transparent'],
        opacityFrom: 0.4, opacityTo: 0.0
      }
    },
    grid: {
      borderColor: '#1e293b',
      strokeDashArray: 4,
      padding: { left: 0, right: 0, top: 0, bottom: 0 }
    },
    theme: { mode: 'dark' },
    xaxis: {
      categories,
      labels: { show: false }, // Kichik kartalarda joy tejash uchun pastki yozuvlar yashirildi
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: { style: { colors: '#334155', fontSize: '8px' }, offsetX: -8 }
    },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v} ${unit}` }
    },
    legend: { show: false },
    dataLabels: { enabled: false },
    markers: { size: 0 }
  };
}

function SensorCard({ icon: Icon, label, value, unit, color, series, categories, limitLabel, alert }) {
  const options = buildChartOptions(color, unit, categories);
  return (
    <div
      className="bg-[#0d1423] rounded-2xl border flex flex-col overflow-hidden w-full transition-all duration-300"
      style={{
        borderColor: alert ? color + '60' : '#1e293b',
        boxShadow: alert ? `0 0 20px ${color}30` : 'none'
      }}
    >
      <div className="flex items-start justify-between p-3 pb-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate">{label}</p>
          <div className="flex items-end gap-1 flex-wrap">
            <p className="text-2xl sm:text-3xl font-mono font-black text-white leading-none">{value}</p>
            <span className="text-xs font-mono mb-0.5" style={{ color }}>{unit}</span>
          </div>
          {limitLabel && (
            <p className="text-[8px] text-slate-600 font-mono mt-1 truncate">{limitLabel}</p>
          )}
        </div>
        <div
          className="p-2 rounded-xl ml-1 mt-0.5 flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          <Icon size={16} />
        </div>
      </div>

      <div className="px-1 pb-1 w-full mt-auto" style={{ height: 85 }}>
        <Chart
          options={options}
          series={[{ name: label, data: series.length ? series : [0] }]}
          type="area"
          height={85}
          width="100%"
        />
      </div>
    </div>
  );
}

// ── ASOSIY ILOVA KOMPONENTI ──
export default function App() {
  const [authState, setAuthState] = useState({ isLoading: true, isAllowed: false, selectedCrop: 'Parnik Ekinlari' });
  const [climate, setClimate] = useState({ temperature: '--', humidity: '--', soil_moisture: '--', light_level: '--', gas_level: '--' });
  const [deviceState, setDeviceState] = useState({ cooler_status: false, pump_status: false });
  const [settings, setSettings] = useState({ max_temp: 30.0, min_soil_moisture: 40.0, min_air_humidity: 50.0, max_gas: 300.0 });
  const [tgUser, setTgUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [rawLogData, setRawLogData] = useState([]);
  const [history, setHistory] = useState({
    categories: [], temperature: [], humidity: [],
    soil_moisture: [], light_level: [], gas_level: []
  });
  const [isExporting, setIsExporting] = useState(false);

  const settingsChannelRef = useRef(null);
  const logsChannelRef = useRef(null);

  const addLog = useCallback((message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [`[${time}] ${message}`, ...prev.slice(0, 4)]);
  }, []);

  const fetchChartHistory = useCallback(async () => {
    const { data } = await supabase
      .from('sensor_logs').select('*')
      .order('id', { ascending: false }).limit(12);
    if (data) {
      setRawLogData(data);
      const rev = [...data].reverse();
      setHistory({
        categories:    rev.map(d => new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        temperature:   rev.map(d => +(d.temperature  ?? 0).toFixed(1)),
        humidity:      rev.map(d => +(d.humidity       ?? 0).toFixed(1)),
        soil_moisture: rev.map(d => +(d.soil_moisture ?? 0).toFixed(1)),
        light_level:   rev.map(d => +(d.light_level    ?? 0).toFixed(1)),
        gas_level:     rev.map(d => +(d.gas_level      ?? 0).toFixed(0)),
      });
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    const { data: logData } = await supabase
      .from('sensor_logs').select('*').order('id', { ascending: false }).limit(1);
    if (logData?.length) setClimate(logData[0]);

    const { data: s } = await supabase
      .from('device_settings').select('*').eq('id', 1).maybeSingle();
    if (s) {
      setSettings(s);
      setDeviceState({ cooler_status: s.cooler_status, pump_status: s.pump_status });
    }
    await fetchChartHistory();
    addLog("✅ Barcha ko'rsatkichlar yangilandi.");
  }, [fetchChartHistory, addLog]);

  const setupRealtime = useCallback(() => {
    if (settingsChannelRef.current) supabase.removeChannel(settingsChannelRef.current);
    if (logsChannelRef.current)    supabase.removeChannel(logsChannelRef.current);

    settingsChannelRef.current = supabase
      .channel('db-device-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_settings', filter: 'id=eq.1' },
        (payload) => {
          setSettings(payload.new);
          setDeviceState({ cooler_status: payload.new.cooler_status, pump_status: payload.new.pump_status });
          addLog(`🔄 Bot yangiladi → Fan: ${payload.new.cooler_status ? 'ON' : 'OFF'}, Nasos: ${payload.new.pump_status ? 'ON' : 'OFF'}`);
        })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') addLog('🟢 Realtime: device_settings ulandi');
      });

    logsChannelRef.current = supabase
      .channel('db-sensor-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs' },
        (payload) => {
          setClimate(payload.new);
          addLog(`⚡ Yangi o'lchov: ${payload.new.temperature}°C`);
          fetchChartHistory();
        })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') addLog('🟢 Realtime: sensor_logs ulandi');
      });
  }, [addLog, fetchChartHistory]);

  useEffect(() => {
    const init = async () => {
      addLog("🔄 Tizim tekshirilmoqda...");
      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready(); tg.expand();
        const user = tg.initDataUnsafe?.user;
        if (user) {
          setTgUser(user);
          const { data: dbUser } = await supabase
            .from('allowed_users').select('*').eq('telegram_id', user.id).maybeSingle();
          if (dbUser) {
            setAuthState({ isLoading: false, isAllowed: true, selectedCrop: 'Parnik Ekinlari' });
            await fetchAllData(); setupRealtime();
          } else {
            setAuthState({ isLoading: false, isAllowed: false, selectedCrop: '' });
          }
          return;
        }
      }
      setAuthState({ isLoading: false, isAllowed: true, selectedCrop: 'Test Panel' });
      await fetchAllData(); setupRealtime();
    };
    init();
    return () => {
      if (settingsChannelRef.current) supabase.removeChannel(settingsChannelRef.current);
      if (logsChannelRef.current)    supabase.removeChannel(logsChannelRef.current);
    };
  }, []);

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      doc.setFont("Helvetica", "bold"); doc.setFontSize(18);
      doc.text("SMART GREENHOUSE MONITORING REPORT", 14, 20);
      doc.setFont("Helvetica", "normal"); doc.setFontSize(10);
      doc.text(`Sana: ${new Date().toLocaleDateString()} | Vaqt: ${new Date().toLocaleTimeString()}`, 14, 28);
      doc.text(`Ekin turi: ${authState.selectedCrop}`, 14, 34);
      doc.setDrawColor(200, 200, 200); doc.line(14, 38, 196, 38);
      doc.setFont("Helvetica", "bold"); doc.setFontSize(12);
      doc.text("Joriy iqlim ko'rsatkichlari:", 14, 46);
      doc.setFont("Helvetica", "normal"); doc.setFontSize(10);
      doc.text(`- Harorat: ${climate.temperature} C  (limit: ${settings.max_temp} C)`, 14, 54);
      doc.text(`- Havo namligi: ${climate.humidity} %`, 14, 60);
      doc.text(`- Tuproq namligi: ${climate.soil_moisture} %  (min: ${settings.min_soil_moisture} %)`, 14, 66);
      doc.text(`- Yorug'lik: ${climate.light_level} %`, 14, 72);
      doc.text(`- Gaz (CO2): ${climate.gas_level} ppm  (limit: ${settings.max_gas} ppm)`, 14, 78);
      doc.setFont("Helvetica", "bold"); doc.text("Aktuatorlar:", 14, 88);
      doc.setFont("Helvetica", "normal");
      doc.text(`- Kuller: ${deviceState.cooler_status ? 'YONIQ' : "O'CHIQ"}`, 14, 96);
      doc.text(`- Nasos: ${deviceState.pump_status ? 'YONIQ' : "O'CHIQ"}`, 14, 102);
      doc.setFont("Helvetica", "bold"); doc.text("Oxirgi o'lchovlar tarixi:", 14, 114);
      const tableRows = rawLogData.map((log, idx) => [
        idx + 1,
        new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        `${log.temperature} C`, `${log.humidity} %`, `${log.soil_moisture} %`,
        `${log.light_level || 0} %`, `${log.gas_level || 0} ppm`
      ]);
      doc.autoTable({
        startY: 120,
        head: [["#", "Vaqt", "Harorat", "Havo Nam.", "Tuproq Nam.", "Yorug'lik", "Gaz (ppm)"]],
        body: tableRows, theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9, font: "Helvetica" }
      });
      doc.save(`Parnik_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      addLog("📄 PDF muvaffaqiyatli yuklab olindi.");
    } catch { addLog("❌ PDF generatsiyada xatolik."); }
    finally { setIsExporting(false); }
  };

  const tempAlert  = typeof climate.temperature === 'number' && climate.temperature > settings.max_temp;
  const humAlert   = typeof climate.humidity === 'number' && climate.humidity < settings.min_air_humidity;
  const soilAlert  = typeof climate.soil_moisture === 'number' && climate.soil_moisture < settings.min_soil_moisture;
  const gasAlert   = typeof climate.gas_level === 'number' && climate.gas_level > settings.max_gas;

  if (authState.isLoading) return (
    <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-3">
      <RefreshCw size={24} className="animate-spin text-indigo-500" />
      <span>Parnik monitoring tizimi yuklanmoqda...</span>
    </div>
  );

  if (!authState.isAllowed) return (
    <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center text-slate-400 p-6 text-center gap-4">
      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full"><Lock size={32} /></div>
      <h2 className="text-white font-bold text-lg">Kirish Rad Etildi</h2>
      <p className="text-xs text-slate-500 font-mono">Telegram ID orqali ruxsat topilmadi.</p>
      <p className="text-xs text-slate-700 font-mono">
        ID: {window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? 'Aniqlanmadi'}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 font-sans pb-12 w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto p-3 space-y-4">

        {/* ── Header ── */}
        <header className="flex justify-between items-center bg-[#0d1423] px-4 py-3 rounded-2xl border border-slate-800 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 flex-shrink-0">
              <Cpu size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-bold uppercase tracking-wider text-white truncate">Smart Greenhouse</h1>
              <p className="text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                {tgUser ? tgUser.first_name : 'Admin'}
              </p>
            </div>
          </div>
          <button onClick={exportToPDF} disabled={isExporting}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-mono text-[10px] font-bold px-3 py-2 rounded-xl transition-all flex-shrink-0">
            <FileText size={13} />
            {isExporting ? '...' : 'PDF'}
          </button>
        </header>

        {/* ── 1-QATOR: BARCHA QIYMATLAR BITTA GRAFIKDA (Kombinatsiyalangan) ── */}
        <MainOverviewChart history={history} />

        {/* ── 2-QATOR: PASTIDAN ALOHIDA RESPONSIV GRAFIKLI KARTALAR ── */}
        <section className="flex flex-col gap-3 w-full">
          {/* Birinchi qator: Havo harorati va Tuproq namligi (Mobilda ixcham grid-cols-2) */}
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 w-full">
            <SensorCard
              icon={Thermometer} label="Havo harorati" value={climate.temperature} unit="°C" color="#f97316"
              series={history.temperature} categories={history.categories}
              limitLabel={`Limit: ${settings.max_temp}°C`} alert={tempAlert}
            />
            <SensorCard
              icon={Sprout} label="Tuproq namligi" value={climate.soil_moisture} unit="%" color="#10b981"
              series={history.soil_moisture} categories={history.categories}
              limitLabel={`Min: ${settings.min_soil_moisture}%`} alert={soilAlert}
            />
          </div>

          {/* Ikkinchi qator: Qolgan alohida grafiklar */}
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full">
            <SensorCard
              icon={Droplets} label="Havo Namligi" value={climate.humidity} unit="%" color="#22d3ee"
              series={history.humidity} categories={history.categories}
              limitLabel={`Min: ${settings.min_air_humidity}%`} alert={humAlert}
            />
            <SensorCard
              icon={Sun} label="Yorug'lik" value={climate.light_level} unit="%" color="#eab308"
              series={history.light_level} categories={history.categories}
              limitLabel="LDR sensor"
            />
            {/* Mobilda muvozanat buzilmasligi uchun toq qolgan oxirgi kartani to'liq eniga chiqaramiz */}
            <div className="col-span-2 sm:col-span-1">
              <SensorCard
                icon={Wind} label="Gaz CO₂" value={climate.gas_level} unit="ppm" color="#f43f5e"
                series={history.gas_level} categories={history.categories}
                limitLabel={`Limit: ${settings.max_gas} ppm`} alert={gasAlert}
              />
            </div>
          </div>
        </section>

        {/* ── Aktuatorlar + Loglar (Responsiv Ustunlar) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">

          {/* Aktuatorlar (Boshqaruv bloki) */}
          <section className="bg-[#0d1423] p-4 rounded-2xl border border-slate-800 flex flex-col gap-3 w-full h-fit">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
              Aktuatorlar
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
              {/* Kuller */}
              <div className={`p-3.5 rounded-xl border flex justify-between items-center transition-all duration-500 ${
                deviceState.cooler_status ? 'bg-orange-500/10 border-orange-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${deviceState.cooler_status ? 'bg-orange-500/20' : 'bg-slate-800'}`}>
                    <Wind size={14} className={deviceState.cooler_status ? 'animate-pulse text-orange-400' : 'text-slate-600'} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[11px] font-mono font-bold truncate ${deviceState.cooler_status ? 'text-orange-300' : 'text-slate-500'}`}>Havo Kuller</p>
                    <p className="text-[8px] text-slate-600 font-mono">Fan relay</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-black px-2 py-1 rounded-lg flex-shrink-0 ${
                  deviceState.cooler_status ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-600'}`}>
                  {deviceState.cooler_status ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* Nasos */}
              <div className={`p-3.5 rounded-xl border flex justify-between items-center transition-all duration-500 ${
                deviceState.pump_status ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${deviceState.pump_status ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                    <Droplets size={14} className={deviceState.pump_status ? 'animate-bounce text-emerald-400' : 'text-slate-600'} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[11px] font-mono font-bold truncate ${deviceState.pump_status ? 'text-emerald-300' : 'text-slate-500'}`}>Suv Nasosi</p>
                    <p className="text-[8px] text-slate-600 font-mono">Pump relay</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-black px-2 py-1 rounded-lg flex-shrink-0 ${
                  deviceState.pump_status ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                  {deviceState.pump_status ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

            {/* Ogohlantirishlar */}
            {(tempAlert || humAlert || soilAlert || gasAlert) && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-[10px] font-mono text-red-400 space-y-1 w-full">
                <p className="font-bold">⚠️ Ogohlantirish:</p>
                {tempAlert && <p>🌡 Harorat limitdan oshdi!</p>}
                {humAlert   && <p>💧 Havo namligi pastladi!</p>}
                {soilAlert && <p>🌱 Tuproq namligi pastladi!</p>}
                {gasAlert   && <p>💨 Gaz miqdori yuqori!</p>}
              </div>
            )}
          </section>

          {/* Jonli Loglar Bloki */}
          <section className="bg-[#0d1423] p-4 rounded-2xl border border-slate-800 md:col-span-2 flex flex-col gap-2 w-full min-h-[160px]">
            <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <Activity size={11} className="text-indigo-400" />
              Jonli Tizim Loglari
            </h4>
            <div className="font-mono text-[10px] space-y-2 flex-1 overflow-y-auto max-h-[250px] pr-1">
              {logs.length === 0
                ? <p className="text-slate-700">Hozircha yangi bildirishnomalar yo'q...</p>
                : logs.map((log, i) => (
                  <p key={i} className={`leading-relaxed break-words ${i === 0 ? 'text-indigo-400 font-semibold' : 'text-slate-600'}`}>
                    {log}
                  </p>
                ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}