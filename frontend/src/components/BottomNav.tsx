// src/components/BottomNav.jsx
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
        {
                label: "HOME",
                path: "/",
                icon: (color: string) => (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path
                                        d="M3 9.5L12 3L21 9.5V20C21 20.6 20.6 21 20 21H15V15H9V21H4C3.4 21 3 20.6 3 20V9.5Z"
                                        stroke={color}
                                        strokeWidth="1.8"
                                />
                                <circle cx="12" cy="5" r="1.5" fill={color} />
                        </svg>
                ),
        },
        {
                label: "LEADERBOARD",
                path: "/leaderboard",
                icon: (color: string) => (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path
                                        d="M6 9H18M8 9V6C8 4.9 8.9 4 10 4H14C15.1 4 16 4.9 16 6V9M5 9L6 19H18L19 9"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                />
                                <path
                                        d="M9 14L11 16L15 12"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                />
                        </svg>
                ),
        },
        {
                label: "BADGES",
                path: "/badges",
                icon: (color: string) => (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <circle
                                        cx="12"
                                        cy="8"
                                        r="4"
                                        stroke={color}
                                        strokeWidth="1.8"
                                />
                                <path
                                        d="M6 8H4M20 8H18M12 4V2M12 14v1"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                />
                                <path
                                        d="M8 14.5C8 14.5 6 15.5 6 18H18C18 15.5 16 14.5 16 14.5"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                />
                                <path
                                        d="M9 8L10.5 9.5L15 6"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                />
                        </svg>
                ),
        },
        {
                label: "PROFILE",
                path: "/profile",
                icon: (color: string) => (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <circle
                                        cx="12"
                                        cy="8"
                                        r="4"
                                        stroke={color}
                                        strokeWidth="1.8"
                                />
                                <path
                                        d="M4 20C4 17 7.6 14.5 12 14.5C16.4 14.5 20 17 20 20"
                                        stroke={color}
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                />
                        </svg>
                ),
        },
];

export default function BottomNav() {
        const location = useLocation();
        const navigate = useNavigate();

        return (
                <nav className="fixed bottom-0 left-0 right-0 z-50 p-3">
                        <div className="bg-gray-900 rounded-2xl px-2 py-3 border border-white/8 max-w-lg mx-auto">
                                <div className="grid grid-cols-4 gap-1">
                                        {tabs.map((tab) => {
                                                const active = location.pathname === tab.path;
                                                const color = active ? "#22c55e" : "#6b7280";
                                                return (
                                                        <button
                                                                key={tab.path}
                                                                onClick={() =>
                                                                        navigate(tab.path)
                                                                }
                                                                className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all"
                                                                style={{
                                                                        background: active
                                                                                ? "rgba(34,197,94,0.08)"
                                                                                : "transparent",
                                                                }}
                                                        >
                                                                {tab.icon(color)}
                                                                <span
                                                                        className="text-[10px] font-medium tracking-wider"
                                                                        style={{ color }}
                                                                >
                                                                        {tab.label}
                                                                </span>
                                                        </button>
                                                );
                                        })}
                                </div>
                        </div>
                </nav>
        );
}
