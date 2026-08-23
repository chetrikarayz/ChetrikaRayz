"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Zap, Shuffle, Gauge, Shield, Activity, Cpu, BarChart3, RefreshCw, Network, CheckCircle, ChevronRight } from "lucide-react";

const easeOut = [0.25, 0.1, 0.25, 1] as const;

const stagger = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: easeOut }
};

function SectionHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
      <motion.span {...stagger} className="inline-block text-primary font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">{label}</motion.span>
      <motion.h2 {...stagger} transition={{ ...stagger.transition, delay: 0.1 }} className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">{title}</motion.h2>
      <motion.p {...stagger} transition={{ ...stagger.transition, delay: 0.2 }} className="text-slate-600 text-sm md:text-lg leading-relaxed">{description}</motion.p>
    </div>
  );
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function AnimatedPhaseDiagram() {
  return (
    <svg viewBox="0 0 500 320" className="w-full max-w-lg mx-auto" fill="none">
      <defs>
        <linearGradient id="phase-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dc2626" /><stop offset="100%" stopColor="#ef4444" /></linearGradient>
        <linearGradient id="phase-y" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d97706" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
        <linearGradient id="phase-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
        <linearGradient id="phase-out" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ea580c" /><stop offset="100%" stopColor="#f97316" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* Input lines */}
      {[
        { x: 40, y: 50, color: "#dc2626", label: "R", delay: 0 },
        { x: 40, y: 135, color: "#d97706", label: "Y", delay: 0.3 },
        { x: 40, y: 220, color: "#2563eb", label: "B", delay: 0.6 },
      ].map(({ x, y, color, label, delay }) => (
        <g key={label}>
          <line x1={x} y1={y} x2={x + 100} y2={y} stroke={color} strokeWidth="3" strokeLinecap="round" />
          <motion.circle
            cx={x} cy={y} r="6" fill={color}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay }}
          />
          {/* Incoming arrow */}
          <motion.polygon
            points={`${x},${y - 7} ${x - 12},${y} ${x},${y + 7}`}
            fill={color}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1, delay }}
          />
          <text x={x - 28} y={y + 4} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">{label}</text>
        </g>
      ))}

      {/* Central Switcher Box */}
      <motion.rect
        x="160" y="30" width="140" height="240" rx="16"
        fill="#0f172a" stroke="#1e293b" strokeWidth="2"
        initial={{ scale: 0.8, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <rect x="165" y="35" width="130" height="230" rx="13" fill="url(#phase-out)" fillOpacity="0.08" />
      <text x="230" y="85" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="bold" letterSpacing="1">PHASE</text>
      <text x="230" y="105" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="bold" letterSpacing="1">SWAPPER</text>

      {/* Inner relays */}
      {[0, 1, 2].map((i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 + i * 0.2 }}
        >
          <rect x="190" y={130 + i * 38} width="80" height="24" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <motion.rect
            x="196" y={134 + i * 38} width="32" height="16" rx="4"
            fill={["#dc2626", "#d97706", "#2563eb"][i]}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4 }}
          />
        </motion.g>
      ))}

      {/* Output lines */}
      {[
        { x: 300, y: 50, label: "Load A" },
        { x: 300, y: 135, label: "Load B" },
        { x: 300, y: 220, label: "Load C" },
      ].map(({ x, y, label }, i) => {
        const colors = ["#f97316", "#f97316", "#f97316"];
        return (
          <g key={label}>
            <line x1={x} y1={y} x2={x + 120} y2={y} stroke={colors[i]} strokeWidth="3" strokeLinecap="round" strokeDasharray="6 3" />
            <motion.polygon
              points={`${x + 120},${y - 7} ${x + 132},${y} ${x + 120},${y + 7}`}
              fill={colors[i]}
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            />
            <text x={x + 140} y={y + 4} textAnchor="start" fill="#64748b" fontSize="12" fontWeight="500">{label}</text>
          </g>
        );
      })}

      {/* Center animated pulse */}
      <motion.circle
        cx="230" cy="200" r="12" fill="none" stroke="#ea580c" strokeWidth="1.5"
        initial={{ scale: 0.8, opacity: 0.6 }}
        animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />
      <motion.circle
        cx="230" cy="200" r="20" fill="none" stroke="#ea580c" strokeWidth="1"
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={{ scale: [0.8, 1.8, 0.8], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
      />
    </svg>
  );
}

function CounterCard({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center p-6"
    >
      <div className="text-3xl md:text-5xl font-extrabold text-primary mb-1 tracking-tight">{value}</div>
      <div className="text-xs md:text-sm text-slate-500 font-medium uppercase tracking-wider">{label}</div>
    </motion.div>
  );
}

const features = [
  {
    icon: <Gauge size={24} />,
    title: "Real-Time Monitoring",
    description: "Continuous voltage, current, and power factor measurement across all three phases with sub-second granularity.",
  },
  {
    icon: <Shuffle size={24} />,
    title: "Automatic Phase Selection",
    description: "Intelligent load detection and automatic connection to the optimal phase based on real-time grid conditions.",
  },
  {
    icon: <Zap size={24} />,
    title: "Sub-Second Switching",
    description: "Solid-state relay technology enables phase transitions in under 20ms — imperceptible to connected loads.",
  },
  {
    icon: <BarChart3 size={24} />,
    title: "Load Balancing Optimization",
    description: "Proprietary algorithms distribute load evenly across phases, reducing neutral current and improving transformer efficiency.",
  },
  {
    icon: <Shield size={24} />,
    title: "Fault Protection",
    description: "Integrated over-voltage, under-voltage, and over-current protection with automatic load shedding on critical faults.",
  },
  {
    icon: <Network size={24} />,
    title: "DTMS Telemetry Integration",
    description: "Seamless data relay to Chetrika Rayz cloud platform via GSM/Wi-Fi for remote monitoring and historical analysis.",
  },
  {
    icon: <Cpu size={24} />,
    title: "Edge Computing Capability",
    description: "On-device processing of electrical parameters with local decision-making — no cloud dependency for core switching logic.",
  },
  {
    icon: <RefreshCw size={24} />,
    title: "Remote Firmware Updates",
    description: "OTA firmware upgrade capability ensures all units stay current with latest optimization algorithms and security patches.",
  },
];

const specifications = [
  { param: "Operating Voltage", value: "230V ± 20% (Single Phase)" },
  { param: "Frequency", value: "50 Hz ± 5%" },
  { param: "Max Load Current", value: "63A per phase (Standard)" },
  { param: "Switching Time", value: "< 20 ms" },
  { param: "Communication", value: "GSM / Wi-Fi / RS485" },
  { param: "Protection Class", value: "IP54 (Outdoor Rated)" },
  { param: "Operating Temp", value: "-10°C to +60°C" },
  { param: "Data Logging", value: "90-day on-device buffer" },
  { param: "Power Consumption", value: "< 5W (Standby)" },
  { param: "Compliance", value: "IS 8623 / IEC 61439" },
];

const benefits = [
  { metric: "40%", label: "Reduction in phase imbalance" },
  { metric: "99.7%", label: "Switching reliability" },
  { metric: "15%", label: "Transformer load optimization" },
  { metric: "50%", label: "Reduction in manual field visits" },
];

export default function PhaseSwapperPage() {
  return (
    <div className="min-h-screen bg-white selection:bg-primary/20">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg md:text-xl font-bold tracking-tight text-slate-900">
              CHETRIKA<span className="text-primary font-extrabold ml-1">RAYZ</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 md:gap-4">
            <Link href="/" className="text-xs md:text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2">
              Home
            </Link>
            <Link
              href="/admin/login"
              className="hidden md:inline-flex px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Client Portal
            </Link>
            <Link
              href="#contact"
              className="px-4 md:px-5 py-2 rounded-lg md:py-2.5 bg-primary text-white text-xs md:text-sm font-medium hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-slate-50">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 -z-10 m-auto h-[400px] w-[400px] rounded-full bg-primary/15 opacity-50 blur-[120px]" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100/50 border border-orange-200 text-orange-700 text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Industrial Product
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Automated
                <span className="text-primary block mt-1 md:mt-2">Phase Swapper</span>
              </h1>
              <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-xl">
                Intelligent three-phase load balancing solution purpose-built for DISCOMs.
                Eliminate phase imbalance, reduce technical losses, and improve transformer
                utilization with sub-second automated switching.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-2">
                <Link
                  href="#contact"
                  className="px-6 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 text-sm md:text-base"
                >
                  Request Demo <ArrowRight size={16} />
                </Link>
                <Link
                  href="#specs"
                  className="px-6 py-3 rounded-xl bg-white text-slate-900 border border-border font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  View Specifications
                </Link>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <AnimatedPhaseDiagram />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border bg-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          {benefits.map((b, i) => (
            <CounterCard key={i} value={b.metric} label={b.label} />
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <SectionHeading
            label="Technology"
            title="How It Works"
            description="The Phase Swapper continuously monitors all three phases and automatically connects the load to the most stable and balanced phase, ensuring optimal power quality."
          />
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Monitor",
                description: "Built-in sensors measure voltage, current, power factor, and frequency on all three phases every 1 second.",
                color: "text-red-500",
                bg: "bg-red-50",
              },
              {
                step: "02",
                title: "Analyze",
                description: "On-device edge processor runs proprietary algorithms to detect imbalance, undervoltage, or overcurrent conditions.",
                color: "text-amber-500",
                bg: "bg-amber-50",
              },
              {
                step: "03",
                title: "Switch",
                description: "Solid-state relays execute phase transition in under 20ms — seamlessly re-routing load to the optimal phase without disruption.",
                color: "text-blue-500",
                bg: "bg-blue-50",
              },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.15}>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-b from-slate-200 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
                  <div className="relative bg-white border border-border rounded-2xl p-6 md:p-8">
                    <div className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center mb-5`}>
                      <span className={`${item.color} font-extrabold text-lg`}>{item.step}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24 bg-slate-50" id="features">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <SectionHeading
            label="Capabilities"
            title="Key Features"
            description="Engineered for the demands of modern distribution networks with reliability and precision at every layer."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {features.map((feature, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div className="bg-white border border-border rounded-xl p-5 md:p-6 hover:shadow-lg hover:border-primary/20 transition-all duration-300 group h-full">
                  <div className="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Specifications */}
      <section className="py-16 md:py-24 bg-white" id="specs">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          <SectionHeading
            label="Technical Data"
            title="Specifications"
            description="Industrial-grade specifications designed for reliable operation in demanding field conditions."
          />
          <FadeIn>
            <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {specifications.map((spec, i) => (
                <div key={i} className="flex items-center justify-between px-5 md:px-8 py-4 md:py-5 hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-medium text-slate-700">{spec.param}</span>
                  <span className="text-sm font-bold text-slate-900">{spec.value}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Integration Section */}
      <section className="py-16 md:py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <FadeIn>
              <div className="space-y-6">
                <span className="inline-block text-primary font-semibold tracking-wide uppercase text-xs">Integration</span>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Seamless DTMS Integration</h2>
                <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                  Every Phase Swapper ships pre-configured to communicate with the Chetrika Rayz DTMS
                  (Distribution Transformer Monitoring System) platform. Data flows automatically via
                  cellular or Wi-Fi — no manual configuration required.
                </p>
                <ul className="space-y-4 pt-2">
                  {[
                    "Real-time telemetry streaming to cloud dashboard",
                    "Historical data logged with 90-day on-device buffer",
                    "Remote phase swapping commands from any browser",
                    "Automated alerts for fault conditions and anomalies",
                    "OTA firmware updates for continuous improvement",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                      <CheckCircle size={16} className="text-primary shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 md:p-8">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-xs text-slate-500 ml-2 font-mono">dtms-terminal — v2.1.4</span>
                </div>
                <pre className="text-sm font-mono text-slate-300 leading-relaxed">
                  <span className="text-slate-500">$</span> ./swapper --status<span className="text-slate-500">  </span>
                  <br />
                  <span className="text-green-400">✓</span> Device CR-SW-0042 initialized
                  <br />
                  <span className="text-green-400">✓</span> Phase R: 238V / 42A / 0.94 PF
                  <br />
                  <span className="text-green-400">✓</span> Phase Y: 241V / 38A / 0.91 PF
                  <br />
                  <span className="text-green-400">✓</span> Phase B: 236V / 45A / 0.89 PF
                  <br />
                  <span className="text-amber-400">!</span> Imbalance detected: Y-phase underloaded
                  <br />
                  <br />
                  <span className="text-slate-500">$</span> ./swapper --auto-balance
                  <br />
                  <span className="text-primary">→</span> Initiating load redistribution...
                  <br />
                  <span className="text-green-400">✓</span> Load balanced: R:41A | Y:43A | B:41A
                  <br />
                  <span className="text-slate-500">✓ Neutral current reduced 62%</span>
                </pre>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <SectionHeading
            label="Applications"
            title="Where It's Deployed"
            description="Built for the real world — deployed across residential, commercial, and industrial distribution networks."
          />
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: <Activity size={28} />,
                title: "Residential Feeder",
                description: "Automatically balances single-phase domestic loads across all three phases, reducing neutral current and transformer heating.",
                tag: "Distribution",
              },
              {
                icon: <Cpu size={28} />,
                title: "Commercial Complex",
                description: "Manages dynamic load patterns in shopping centers and office buildings where phase imbalance fluctuates throughout the day.",
                tag: "Commercial",
              },
              {
                icon: <Zap size={28} />,
                title: "Industrial Sheds",
                description: "Protects sensitive manufacturing equipment from phase-related voltage fluctuations and unbalance conditions.",
                tag: "Industrial",
              },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.15}>
                <div className="border border-border rounded-2xl p-6 md:p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                      {item.icon}
                    </div>
                    <span className="text-xs font-semibold text-primary bg-primary/5 px-2.5 py-1 rounded-full">{item.tag}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24 bg-slate-50" id="contact">
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <FadeIn>
            <div className="bg-white border border-border rounded-3xl p-8 md:p-16 shadow-sm">
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Zap size={28} className="text-primary" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">Ready to Eliminate Phase Imbalance?</h2>
              <p className="text-slate-600 text-base md:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
                Deploy Chetrika Rayz Phase Swappers across your distribution network and see immediate improvement in transformer utilization and power quality.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
                <Link
                  href="/admin/login"
                  className="px-6 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-lg shadow-primary/20 text-sm md:text-base"
                >
                  Access System Portal <ChevronRight size={16} />
                </Link>
                <a
                  href="mailto:info@chetrikarayz.com"
                  className="px-6 py-3 rounded-xl bg-white text-slate-900 border border-border font-medium hover:bg-slate-50 transition-colors text-sm md:text-base"
                >
                  Contact Sales
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-border pt-12 md:pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 md:mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  CHETRIKA<span className="text-primary font-extrabold ml-1">RAYZ</span>
                </span>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed max-w-xs">
                Advanced engineering firm delivering specialized hardware and software solutions for modern utility networks.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm tracking-wide">Product</h4>
              <ul className="space-y-2.5">
                <li><Link href="/phase-swapper" className="text-slate-600 hover:text-primary transition-colors text-sm">Phase Swapper</Link></li>
                <li><Link href="/" className="text-slate-600 hover:text-primary transition-colors text-sm">DTMS Telemetry</Link></li>
                <li><Link href="/" className="text-slate-600 hover:text-primary transition-colors text-sm">Grid Analytics</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm tracking-wide">Company</h4>
              <ul className="space-y-2.5">
                <li><Link href="/" className="text-slate-600 hover:text-primary transition-colors text-sm">About Us</Link></li>
                <li><Link href="/admin/login" className="text-slate-600 hover:text-primary transition-colors text-sm">System Portal</Link></li>
                <li><Link href="#contact" className="text-slate-600 hover:text-primary transition-colors text-sm">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4 text-sm tracking-wide">Contact</h4>
              <address className="not-italic text-sm text-slate-600 leading-relaxed space-y-1">
                <p className="font-medium text-slate-900">M/s. CHETRIKA RAYZ</p>
                <p>Patta No 48, Near Panchayat Samiti,</p>
                <p>Opp Tehsil Office, Rashmi,</p>
                <p>Distt. Chittorgarh-312203</p>
              </address>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-slate-500 text-xs font-medium">&copy; {new Date().getFullYear()} Chetrika Rayz. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <Link href="/" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
              <Link href="/" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
