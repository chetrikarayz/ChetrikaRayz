import Link from "next/link";
import { ChevronRight } from "lucide-react";

const services = [
  {
    title: "Custom Development",
    description:
      "We build bespoke software solutions tailored to your specific needs. Our team of experts will work with you to create a product that is both powerful and easy to use.",
  },
  {
    title: "Infrastructure Management",
    description:
      "We provide comprehensive infrastructure management services to ensure that your systems are always running smoothly. We take care of everything from server maintenance to security updates.",
  },
  {
    title: "Cloud Solutions",
    description:
      "We can help you migrate your existing applications to the cloud or build new ones from scratch. Our team has experience with all major cloud providers, including AWS, Azure, and Google Cloud.",
  },
];

const Services = () => {
  return (
    <section id="solutions" className="py-16 md:py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-16">
          <h2 className="text-primary font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">
            Our Services
          </h2>
          <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4">
            Transforming Your Business
          </h3>
          <p className="text-slate-600 text-sm md:text-base">
            We provide a wide range of services to help you achieve your
            business goals.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 md:gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-5 md:p-8 border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <h4 className="text-lg md:text-xl font-bold text-slate-900 mb-2 md:mb-3">
                {service.title}
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed mb-4 md:mb-6">
                {service.description}
              </p>
              <Link
                href="#"
                className="flex items-center gap-2.5 text-sm text-primary font-medium"
              >
                Learn More <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;