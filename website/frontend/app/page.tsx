import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";

const solutions = [
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary"
      >
        <path
          d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12L16 16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12L8 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "Automated Phase Swapping",
    desc: "Industrial-grade control system designed exclusively for DISCOMs. Dynamically monitors and redistributes electrical loads preventing faults.",
    features: ["Real-time analysis", "Sub-second switching"],
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary"
      >
        <rect x="2" y="2" width="20" height="20" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
        <line x1="9" y1="2" x2="9" y2="22" stroke="currentColor" strokeWidth="2" />
        <line x1="15" y1="2" x2="15" y2="22" stroke="currentColor" strokeWidth="2" />
        <line x1="2" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="2" />
        <line x1="2" y1="15" x2="22" y2="15" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: "DTMS Telemetry",
    desc: "SCADA-compatible IoT hardware that bridges legacy distribution equipment with cloud-based analytics for operational visibility.",
    features: ["Condition monitoring", "Automated anomaly reporting"],
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary"
      >
        <path
          d="M12 22S17.5228 18 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 18 7.47715 22 12 22Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "Smart Grid Security",
    desc: "Advanced protective relays and smart sensors that isolate faults rapidly to reduce technical losses and ensure grid stability.",
    features: ["Rapid fault isolation", "Predictive maintenance"],
  },
  {
    icon: (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-primary"
        >
            <path d="M7 8L3 12L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 8L21 12L17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 4L10 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    title: "Software Development",
    desc: "Custom software solutions to streamline your operations and enhance productivity, from embedded systems to enterprise applications.",
    features: ["Bespoke applications", "System integration"],
  },
  {
      icon: (
          <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-primary"
          >
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
      ),
      title: "Infrastructure Management",
      desc: "Comprehensive management of your IT infrastructure, ensuring reliability, security, and scalability for your business.",
      features: ["Server management", "Network security"],
  },
];

const NewHeroRight = () => (
  <div className="relative lg:ml-auto w-full max-w-lg mx-auto">
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
      <div className="border-b border-slate-700 p-4 bg-slate-800/50 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
      </div>
      <div className="p-8">
        <pre className="text-sm font-mono text-slate-300">
          <span className="text-primary">const</span>{" "}
          <span className="text-blue-400">systemStatus</span> = {"{"}
          <br />
          &nbsp;&nbsp;nodeId:{" "}
          <span className="text-green-400">'CR-7842'</span>,
          <br />
          &nbsp;&nbsp;uptime: <span className="text-amber-400">
            99.998
          </span>
          ,
          <br />
          &nbsp;&nbsp;phaseLoads: {"{"}
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;R:{" "}
          <span className="text-amber-400">240</span>,{" "}
          <span className="text-slate-500">// Amps</span>
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;Y:{" "}
          <span className="text-amber-400">238</span>,
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;B:{" "}
          <span className="text-amber-400">242</span>
          <br />
          &nbsp;&nbsp;{"}"},
          <br />
          &nbsp;&nbsp;optimizationReady:{" "}
          <span className="text-primary">true</span>
          <br />
          {"}"};
          <br />
          <br />
          <span className="text-slate-500">
            // Auto-rebalancing initiated...
          </span>
          <br />
          <br />
          <span className="text-primary">await</span>{" "}
          gridController.balanceLoad(systemStatus);
        </pre>
      </div>
    </div>
  </div>
);

const CoreTechVisualization = () => (
    <div className="relative flex justify-center items-center h-full">
        <svg viewBox="0 0 400 300" className="w-full h-full">
            <defs>
                <linearGradient id="grad-blue" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="grad-orange" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#fb923c" />
                </linearGradient>
            </defs>
            {/* Edge Device */}
            <g transform="translate(20, 100)">
                <rect width="120" height="100" rx="10" fill="url(#grad-blue)" />
                <text x="60" y="55" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Edge Device</text>
            </g>
            {/* Cloud Platform */}
            <g transform="translate(260, 100)">
                <rect width="120" height="100" rx="10" fill="url(#grad-orange)" />
                <text x="60" y="45" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Cloud</text>
                <text x="60" y="65" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Platform</text>
            </g>
            {/* Connecting Lines */}
            <path d="M 140 130 Q 200 100 260 130" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="5,5">
                <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1s" repeatCount="indefinite" />
            </path>
            <path d="M 140 170 Q 200 200 260 170" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="5,5">
                 <animate attributeName="stroke-dashoffset" from="0" to="10" dur="1s" repeatCount="indefinite" />
            </path>
        </svg>
    </div>
);

const ContactForm = () => (
    <section id="contact-form" className="py-16 md:py-24">
        <div className="max-w-xl mx-auto px-4 md:px-6">
            <div className="text-center mb-10 md:mb-16">
                <h2 className="text-primary font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">Contact Us</h2>
                <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4">Get in Touch</h3>
                <p className="text-slate-600 text-sm md:text-base">Have a question or want to work together? Fill out the form below.</p>
            </div>
            <form className="space-y-6">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                    <input type="email" id="email" className="block w-full px-4 py-3 rounded-lg border border-border focus:ring-primary focus:border-primary transition-colors" placeholder="you@example.com" />
                </div>
                <div>
                    <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-2">Message</label>
                    <textarea id="message" rows={4} className="block w-full px-4 py-3 rounded-lg border border-border focus:ring-primary focus:border-primary transition-colors" placeholder="Your message..."></textarea>
                </div>
                <div className="text-center">
                    <button type="submit" className="px-8 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg text-sm md:text-base">
                        Submit
                    </button>
                </div>
            </form>
        </div>
    </section>
);


export default function Home() {
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

          <div className="flex items-center gap-2 md:gap-4">
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

            <details className="md:hidden group relative">
              <summary className="list-none flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors">
                <svg
                  className="w-5 h-5 text-slate-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </summary>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-border rounded-xl shadow-xl py-2 z-50">
                <div className="border-t border-border my-2"></div>
                <Link
                  href="/admin/login"
                  className="block px-4 py-2.5 text-sm font-semibold text-primary hover:bg-slate-50 transition-colors"
                >
                  Client Portal
                </Link>
              </div>
            </details>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-24 pb-16 md:pt-32 md:pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-50">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-40 blur-[100px]"></div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="space-y-6 md:space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100/50 border border-orange-200 text-orange-700 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Next-Gen Industrial Intelligence
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-slate-900">
                Engineering{" "}
                <span className="text-primary block mt-1 md:mt-2">
                  The Future.
                </span>
              </h1>

              <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-xl">
                We empower industries with robust, indigenous technologies,
                constructing reliable, efficient, and future-ready electrical
                infrastructure for modern grid operations.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 pt-2 md:pt-4">
                <Link
                  href="#solutions"
                  className="px-5 md:px-6 py-3 md:py-3.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 text-sm md:text-base"
                >
                  Explore Solutions{" "}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5 12H19"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 5L19 12L12 19"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <Link
                  href="#demo"
                  className="px-5 md:px-6 py-3 md:py-3.5 rounded-xl bg-white text-slate-900 border border-border font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  View Case Studies
                </Link>
              </div>
            </div>
            <NewHeroRight />
          </div>
        </div>
      </header>
      {/* Solutions */}
      <section id="solutions" className="py-16 md:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
            <h2 className="text-primary font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">
              Our Solutions
            </h2>
            <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4">
              Transforming Grid Operations
            </h3>
            <p className="text-slate-600 text-sm md:text-base">
              Combining rugged industrial hardware with precision software
              analytics to resolve critical electrical distribution challenges.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-8">
            {solutions.map((sol, i) => (
              <div
                key={i}
                className={`bg-white rounded-2xl p-5 md:p-8 border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${i === solutions.length - 1 && solutions.length % 2 !== 0 ? 'md:col-span-2' : ''}`}
              >
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4 md:mb-6">
                  {sol.icon}
                </div>
                <h4 className="text-lg md:text-xl font-bold text-slate-900 mb-2 md:mb-3">
                  {sol.title}
                </h4>
                <p className="text-slate-600 text-sm leading-relaxed mb-4 md:mb-6">
                  {sol.desc}
                </p>
                <div className="space-y-2 md:space-y-3 mt-auto border-t border-slate-100 pt-4 md:pt-6">
                  {sol.features.map((f, j) => (
                    <div
                      key={j}
                      className="flex items-center gap-2.5 text-sm text-slate-700 font-medium"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-primary shrink-0"
                      >
                        <path
                          d="M22 11.08V12a10 10 0 11-5.93-9.14"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M22 4L12 14.01l-3-3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{f}</span>
                    </div>
                  ))}
                  {sol.title === "Automated Phase Swapping" && (
                    <Link
                      href="/phase-swapper"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors mt-3"
                    >
                      Learn more <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phase Swapper CTA */}
      <section className="py-16 md:py-20 bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 text-center">
          <div className="bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-3xl p-8 md:p-14 shadow-sm">
            <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
                <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M12 6L8 9V15L12 18L16 15V9L12 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
              </svg>
            </div>
            <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
              Intelligent Phase Swapping Technology
            </h3>
            <p className="text-slate-600 text-sm md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
              Our automated phase swapper continuously monitors three-phase distribution and
              dynamically re-balances loads in sub-second time — eliminating voltage imbalance,
              reducing neutral current, and extending transformer life.
            </p>
            <Link
              href="/phase-swapper"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors shadow-xl shadow-slate-900/10 text-sm md:text-base"
            >
              Explore Phase Swapper <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Technology / Features */}
      <section
        id="technology"
        className="py-16 md:py-24 bg-slate-900 text-white overflow-hidden relative"
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <h2 className="text-primary font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">
                Core Technology
              </h2>
              <h3 className="text-2xl md:text-4xl font-bold mb-4 md:mb-6">
                Built for the demands of modern infrastructure
              </h3>
              <p className="text-slate-400 text-base md:text-lg mb-6 md:mb-8 leading-relaxed">
                Our proprietary stack seamlessly integrates rugged edge devices
                with a powerful cloud analytics platform, providing utility
                operators with unprecedented control and visibility.
              </p>

              <div className="space-y-4 md:space-y-6">
                {[
                  {
                    icon: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 20L12 4M4 12L20 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                    title: "Distributed Edge Computing",
                    desc: "Process decisions locally in milliseconds before cloud syncing.",
                  },
                  {
                    icon: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M4 4H8V20H4V4Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 10H16V20H12V10Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                    title: "Predictive Analytics",
                    desc: "Machine learning models predicting equipment failure before it happens.",
                  },
                  {
                    icon: (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 12L16 16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 12L8 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                    title: "Military-grade Security",
                    desc: "End-to-end encryption securing critical infrastructure from cyber threats.",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex gap-4 p-4 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-1">{item.title}</h4>
                      <p className="text-slate-400 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <CoreTechVisualization />
          </div>
        </div>
      </section>

      <ContactForm />

      {/* Footer */}
      <footer
        id="contact"
        className="bg-slate-50 border-t border-border pt-12 md:pt-20 pb-8 md:pb-10"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 md:gap-12 mb-10 md:mb-16">
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4 md:mb-6">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7 md:h-8 md:w-8 text-primary"
                >
                  <path
                    d="M12 2L4 7V17L12 22L20 17V7L12 2Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 6L8 9V15L12 18L16 15V9L12 6Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                    opacity="0.6"
                  />
                  <path
                    d="M12 10L10.5 12L12 14L13.5 12L12 10Z"
                    fill="currentColor"
                    opacity="0.8"
                  />
                </svg>
                <span className="text-lg md:text-xl font-bold tracking-tight text-slate-900">
                  CHETRIKA
                  <span className="text-primary font-extrabold ml-1">RAYZ</span>
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed mb-4 md:mb-6 text-sm md:text-base max-w-sm">
                Advanced engineering firm delivering specialized hardware and
                software integration for modern utility networks. Verified and
                pilot-tested with leading regional power distribution
                companies.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-3 md:mb-4 tracking-wide text-sm md:text-base">
                Solutions
              </h4>
              <ul className="space-y-2 md:space-y-3">
                <li>
                  <Link
                    href="/phase-swapper"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Phase Swapping
                  </Link>
                </li>
                <li>
                  <Link
                    href="#solutions"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Telemetry Hardware
                  </Link>
                </li>
                <li>
                  <Link
                    href="#solutions"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Grid Analytics
                  </Link>
                </li>
                <li>
                  <Link
                    href="#solutions"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Custom Integration
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 mb-3 md:mb-4 tracking-wide text-sm md:text-base">
                Company
              </h4>
              <ul className="space-y-2 md:space-y-3">
                <li>
                  <Link
                    href="#about"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    About Us
                  </Link>
                </li>
                <li>
                  <Link
                    href="#"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Careers
                  </Link>
                </li>
                <li>
                  <Link
                    href="#demo"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    Case Studies
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/login"
                    className="text-slate-600 hover:text-primary transition-colors text-sm"
                  >
                    System Portal
                  </Link>
                </li>
              </ul>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <h4 className="font-bold text-slate-900 mb-3 md:mb-4 tracking-wide text-sm md:text-base">
                Corporate HQ
              </h4>
              <address className="not-italic text-sm text-slate-600 leading-relaxed space-y-1 md:space-y-2">
                <p className="font-medium text-slate-900">
                  M/s. CHETRIKA RAYZ
                </p>
                <p>Patta No 48, Khasra No 1547,</p>
                <p>Near Panchayat Samiti,</p>
                <p>Opp Tehsil Office,</p>
                <p>Rashmi, Distt. Chittorgarh-312203</p>
              </address>
            </div>
          </div>

          <div className="border-t border-border pt-6 md:pt-8 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
            <p className="text-slate-500 text-xs md:text-sm font-medium">
              &copy; {new Date().getFullYear()} Chetrika Rayz. All rights
              reserved.
            </p>
            <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm text-slate-500">
              <Link
                href="#"
                className="hover:text-slate-900 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="#"
                className="hover:text-slate-900 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}