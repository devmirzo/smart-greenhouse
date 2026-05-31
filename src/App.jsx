import React, { useState, useEffect, useCallback } from 'react';
import {
  Thermometer, Droplets, Sun, Wind, Cpu, Lock, Sprout, RefreshCw, FileText, Activity
} from 'lucide-react';
import Chart from 'react-apexcharts';
import { supabase } from './supabaseClient';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ── Har bir ko'rsatkich uchun grafik konfiguratsiyasi ──────────────────────────
function buildChartOptions(color, unit, categories) {
  return {
    chart: {
      toolbar: { show: false },
      background: 'transparent',
      sparkline: { enabled: false },
      animations: { enabled: true, speed: 600 }
    },
    colors: [color],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        shadeIntensity: 0.5,
        gradientToColors: ['transparent'],
        opacityFrom: 0.4,
        opacityTo: 0.0
      }
    },
    grid: { borderColor: '#1e293b', strokeDashArray: 3, padding: { left: 4, right: 4 } },
    theme: { mode: 'dark' },
    xaxis: {
      categories,
      labels: { style: { colors: '#475569', fontSize: '8px' }, rotate: -30 },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: { labels: { style: { colors: '#475569', fontSize: '8px' } } },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v) => `${v} ${unit}` }
    },
    legend: { show: false },
    dataLabels: { enabled: false }
  };
}

// ── Mini grafik kartasi ────────────────────────────────────────────────────────
function SensorCard({ icon: Icon, label, value, unit, color, series, categories, limitLabel }) {
  const options = buildChartOptions(color, unit, categories);
  return (
    <div
      className="bg-[#0d1423] rounded-2xl border border-slate-800 p-4 flex flex-col gap-3 shadow-lg"
      style={{ boxShadow: `0 0 24px ${color}18` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{label}</p>
          <p className="text-3xl font-mono font-black text-white leading-none">
            {value}
            <span className="text-sm ml-1" style={{ color }}>{unit}</span>
          </p>
          {limitLabel && (
            <p className="text-[8px] text-slate-600 font-mono mt-1">{limitLabel}</p>
          )}
        </div>
        <div
          className="p-2 rounded-xl"
          style={{ background: `${color}18`, color }}
        >
          <Icon size={18} />
        </div>
      </div>
      <div className="w-full" style={{ height: 80 }}>
        <Chart
          options={options}
          series={[{ name: label, data: series }]}
          type="area"
          height={80}
        />
      </div>
    </div>
  );
}

// ── Asosiy komponent ───────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState({ isLoading: true, isAllowed: false, selectedCrop: 'Parnik Ekinlari' });

  const [climate, setClimate] = useState({
    temperature: '--', humidity: '--', soil_moisture: '--', light_level: '--', gas_level: '--'
  });
  const [deviceState, setDeviceState] = useState({ cooler_status: false, pump_status: false });
  const [settings, setSettings] = useState({ max_temp: 30.0, min_soil_moisture: 40.0, max_gas: 300.0 });

  const [tgUser, setTgUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [rawLogData, setRawLogData] = useState([]);

  const [history, setHistory] = useState({
    categories: [],
    temperature: [],
    humidity: [],
    soil_moisture: [],
    light_level: [],
    gas_level: []
  });

  const [isExporting, setIsExporting] = useState(false);

  const addLog = useCallback((message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [`[${time}] ${message}`, ...prev.slice(0, 4)]);
  }, []);

  const fetchChartHistory = useCallback(async () => {
    const { data } = await supabase
      .from('sensor_logs')
      .select('*')
      .order('id', { ascending: false })
      .limit(12);

    if (data) {
      setRawLogData(data);
      const rev = [...data].reverse();
      setHistory({
        categories:    rev.map(d => new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        temperature:   rev.map(d => d.temperature   ?? 0),
        humidity:      rev.map(d => d.humidity       ?? 0),
        soil_moisture: rev.map(d => d.soil_moisture  ?? 0),
        light_level:   rev.map(d => d.light_level    ?? 0),
        gas_level:     rev.map(d => d.gas_level      ?? 0),
      });
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    const { data: logData } = await supabase
      .from('sensor_logs').select('*').order('id', { ascending: false }).limit(1);
    if (logData?.length) setClimate(logData[0]);

    const { data: settingsData } = await supabase
      .from('device_settings').select('*').eq('id', 1).maybeSingle();
    if (settingsData) {
      setSettings(settingsData);
      setDeviceState({ cooler_status: settingsData.cooler_status, pump_status: settingsData.pump_status });
    }

    await fetchChartHistory();
    addLog("✅ Barcha ko'rsatkichlar yangilandi.");
  }, [fetchChartHistory, addLog]);

  const setupRealtime = useCallback(() => {
    supabase.channel('settings-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_settings', filter: 'id=eq.1' }, payload => {
        setSettings(payload.new);
        setDeviceState({ cooler_status: payload.new.cooler_status, pump_status: payload.new.pump_status });
        addLog(`🔄 Bot yangiladi → Kuller: ${payload.new.cooler_status ? 'ON' : 'OFF'}, Nasos: ${payload.new.pump_status ? 'ON' : 'OFF'}`);
      }).subscribe();

    supabase.channel('logs-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs' }, payload => {
        setClimate(payload.new);
        addLog(`⚡ Yangi o'lchov: ${payload.new.temperature}°C`);
        fetchChartHistory();
      }).subscribe();
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
          const { data: dbUser } = await supabase.from('allowed_users').select('*').eq('telegram_id', user.id).maybeSingle();
          if (dbUser) {
            setAuthState({ isLoading: false, isAllowed: true, selectedCrop: 'Parnik Ekinlari' });
            await fetchAllData(); setupRealtime();
          } else {
            setAuthState({ isLoading: false, isAllowed: false, selectedCrop: '' });
          }
          return;
        }
      }
      // Telegram WebApp bo'lmasa — test rejimi
      setAuthState({ isLoading: false, isAllowed: true, selectedCrop: 'Test Panel' });
      await fetchAllData(); setupRealtime();
    };
    init();
  }, [fetchAllData, setupRealtime]);

  // ── PDF eksport ──────────────────────────────────────────────────────────────
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
      doc.setFont("Helvetica", "bold");
      doc.text("Aktuatorlar:", 14, 88);
      doc.setFont("Helvetica", "normal");
      doc.text(`- Kuller: ${deviceState.cooler_status ? 'YONIQ' : "O'CHIQ"}`, 14, 96);
      doc.text(`- Nasos: ${deviceState.pump_status ? 'YONIQ' : "O'CHIQ"}`, 14, 102);
      doc.setFont("Helvetica", "bold");
      doc.text("Oxirgi o'lchovlar tarixi:", 14, 114);
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
      <p className="text-xs text-slate-600 font-mono">Telegram ID: {window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? 'Aniqlanmadi'}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 font-sans pb-12">
      <div className="max-w-6xl mx-auto space-y-4">

        <header className="flex justify-between items-center bg-[#0d1423] p-4 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Cpu size={20} />
            </div>
            <div>
              <h1 className="text-xs font-bold uppercase tracking-wider text-white">GREENHOUSE MONITOR V2</h1>
              <p className="text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Faqat Kuzatish Rejimi · {tgUser ? tgUser.first_name : 'Admin'}
              </p>
            </div>
          </div>
          <button
            onClick={exportToPDF} disabled={isExporting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-mono text-[11px] font-bold px-3 py-2 rounded-xl transition-all"
          >
            <FileText size={14} />
            {isExporting ? 'Eksport...': 'PDF Yuklash'}
          </button>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <SensorCard
            icon={Thermometer} label="Havo Harorati"
            value={climate.temperature} unit="°C" color="#f97316"
            series={history.temperature} categories={history.categories}
            limitLabel={`Maks. chegara: ${settings.max_temp}°C`}
          />
          <SensorCard
            icon={Droplets} label="Havo Namligi"
            value={climate.humidity} unit="%" color="#22d3ee"
            series={history.humidity} categories={history.categories}
            limitLabel="DHT11 Sensor"
          />
          <SensorCard
            icon={Sprout} label="Tuproq Namligi"
            value={climate.soil_moisture} unit="%" color="#10b981"
            series={history.soil_moisture} categories={history.categories}
            limitLabel={`Min. chegara: ${settings.min_soil_moisture}%`}
          />
          <SensorCard
            icon={Sun} label="Yorug'lik"
            value={climate.light_level} unit="%" color="#eab308"
            series={history.light_level} categories={history.categories}
            limitLabel="LDR Foto-rezistor"
          />
          <SensorCard
            icon={Wind} label="Gaz (CO₂)"
            value={climate.gas_level} unit="ppm" color="#f43f5e"
            series={history.gas_level} categories={history.categories}
            limitLabel={`Xavfsiz: ${settings.max_gas} ppm`}
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="bg-[#0d1423] p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
              Aktuatorlar Statusi
            </h3>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Telegram bot buyruqlari yoki avtomatika asosida boshqariladi. Faqat kuzatish.
            </p>
            <div className={`p-3 rounded-xl border flex justify-between items-center transition-all duration-500 ${
              deviceState.cooler_status
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-slate-900/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Wind size={14} className={deviceState.cooler_status ? 'animate-pulse text-orange-400' : 'text-slate-600'} />
                <span className={`text-[11px] font-mono ${deviceState.cooler_status ? 'text-orange-400 font-bold' : 'text-slate-500'}`}>
                  Havo Kuller
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold ${deviceState.cooler_status ? 'text-orange-400' : 'text-slate-700'}`}>
                {deviceState.cooler_status ? 'YOQILGAN' : "O'CHIRILGAN"}
              </span>
            </div>
            <div className={`p-3 rounded-xl border flex justify-between items-center transition-all duration-500 ${
              deviceState.pump_status
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-slate-900/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Droplets size={14} className={deviceState.pump_status ? 'animate-bounce text-emerald-400' : 'text-slate-600'} />
                <span className={`text-[11px] font-mono ${deviceState.pump_status ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                  Suv Nasosi
                </span>
              </div>
              <span className={`text-[10px] font-mono font-bold ${deviceState.pump_status ? 'text-emerald-400' : 'text-slate-700'}`}>
                {deviceState.pump_status ? 'YOQILGAN' : "O'CHIRILGAN"}
              </span>
            </div>
          </section>

          <section className="bg-[#0d1423] p-4 rounded-2xl border border-slate-800 shadow-inner lg:col-span-2 flex flex-col gap-3">
            <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <Activity size={12} className="text-indigo-400" />
              Jonli Tizim Loglari
            </h4>
            <div className="font-mono text-[10px] text-slate-500 space-y-1.5 flex-1">
              {logs.length === 0
                ? <p className="text-slate-700">Hozircha yangi bildirishnomalar yo'q...</p>
                : logs.map((log, i) => (
                  <p key={i} className={i === 0 ? 'text-indigo-400 font-semibold' : 'text-slate-600'}>
                    {log}
                  </p>
                ))
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
