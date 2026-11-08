import React from 'react';
import { MapPin, Phone, Mail, Globe, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-slate-100">
          {/* Bitopi Group 50 Years Logo Artwork */}
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <img
              src="/assets/aistudio/Bitopi_Logo_Final_5ad976dc.png"
              alt="Bitopi Group - 50 Years & Beyond"
              className="h-20 sm:h-24 object-contain"
            />
            <div className="max-w-md">
              <h3 className="font-extrabold text-slate-900 text-base">
                Bitopi Group Corporate Onboarding System
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Pioneering apparel manufacturing, advertising, and technology operations across Bangladesh for over 50 years. Empowering seamless human resource recruitment and joining automation.
              </p>
            </div>
          </div>

          {/* Quick Corporate Office Information */}
          <div className="text-xs text-slate-600 space-y-1.5 text-center md:text-right">
            <div className="flex items-center justify-center md:justify-end gap-1.5 font-semibold text-slate-900">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>Corporate Office:</span>
            </div>
            <p>823/3 Begum Rokeya Sharani, Shewrapara, Mirpur, Dhaka-1216</p>
            <p className="text-indigo-600 font-medium">
              (Close to Metro Rail Pillar No 321)
            </p>
            <p className="font-mono text-[11px] text-slate-500">
              Tel: +880 2 9876543 · hr.corporate@bitopigroup.com
            </p>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} Bitopi Group &amp; Tarasima Apparels Ltd. All Rights Reserved.
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Tarasima Apparels Ltd.</span>
            <span>·</span>
            <span>Misami Garments Ltd.</span>
            <span>·</span>
            <span>Bitopi Advertising</span>
            <span>·</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> ISO &amp; WRAP Certified
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
