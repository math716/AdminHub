'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface GradientCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleValue?: string | number;
  icon?: LucideIcon;
  gradient: 'teal' | 'purple' | 'pink' | 'blue' | 'orange';
  chart?: ReactNode;
  delay?: number;
}

const gradients = {
  teal: 'from-teal-500 via-cyan-600 to-teal-700',
  purple: 'from-purple-500 via-violet-600 to-purple-700',
  pink: 'from-pink-500 via-rose-500 to-pink-600',
  blue: 'from-blue-500 via-indigo-600 to-blue-700',
  orange: 'from-orange-500 via-amber-500 to-orange-600',
};

const iconBgColors = {
  teal: 'bg-teal-400/30',
  purple: 'bg-purple-400/30',
  pink: 'bg-pink-400/30',
  blue: 'bg-blue-400/30',
  orange: 'bg-orange-400/30',
};

export default function GradientCard({
  title,
  value,
  subtitle,
  subtitleValue,
  icon: Icon,
  gradient,
  chart,
  delay = 0,
}: GradientCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradients[gradient]} p-5 shadow-lg shadow-black/20`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="80" cy="20" r="40" fill="currentColor" />
        </svg>
      </div>

      <div className="relative z-10 flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-white/80 text-sm font-medium mb-1">{title}</h3>
          <p className="text-white text-2xl font-bold tracking-tight">{value}</p>
          
          {subtitle && (
            <div className="mt-3">
              <p className="text-white/70 text-xs">{subtitle}</p>
              {subtitleValue && (
                <p className="text-white font-semibold text-sm">{subtitleValue}</p>
              )}
            </div>
          )}
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-xl ${iconBgColors[gradient]}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        )}
      </div>

      {/* Mini chart area */}
      {chart && (
        <div className="relative z-10 mt-4 h-16">
          {chart}
        </div>
      )}
    </motion.div>
  );
}
