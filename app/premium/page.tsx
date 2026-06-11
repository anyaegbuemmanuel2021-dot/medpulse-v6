"use client";
import React from "react";
import { PLAN_FEATURES } from "@/services/premium.service";

export default function PremiumPage() {
  const plans = [
    { tier: "free",         label: "Free",         price: "$0/mo",   color: "slate"  },
    { tier: "premium",      label: "Premium",      price: "$9/mo",   color: "blue"   },
    { tier: "professional", label: "Professional", price: "$29/mo",  color: "purple" },
    { tier: "enterprise",   label: "Enterprise",   price: "Custom",  color: "gold"   },
  ] as const;
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Upgrade Your MedPulse</h1>
        <p className="text-slate-500 mt-2">Advanced tools for healthcare professionals</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div key={plan.tier}
            className={`rounded-2xl border-2 p-6 flex flex-col
              ${plan.tier === "premium" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
            <p className="font-bold text-slate-900 dark:text-white text-lg">{plan.label}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1 mb-4">{plan.price}</p>
            <ul className="space-y-2 flex-1">
              {PLAN_FEATURES[plan.tier].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button className={`mt-6 w-full py-2.5 rounded-xl font-medium transition text-sm
              ${plan.tier === "premium" ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
              {plan.tier === "free" ? "Current Plan" : "Get Started"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
