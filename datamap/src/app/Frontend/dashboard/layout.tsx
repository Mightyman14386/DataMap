"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Database, LayoutDashboard, LogOut, User } from "lucide-react";
import styles from "./dashboard.module.css";
import { useEffect, useState } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className={styles.dashboardContainer}>
            {/* Animated Grid Background */}
            <div className={styles.gridBackground} />

            {/* Top Navigation Bar */}
            <header className={styles.topNav}>
                <div className={styles.logo}>
                    <Database className={styles.logoIcon} size={28} />
                    <span>DataMap</span>
                </div>

                <div className={styles.userProfile}>
                    <div className={styles.userInfo}>
                        <span className={styles.userName}>Operator 01</span>
                        <span className={styles.userEmail}>SECURE_LINK // ACTIVE</span>
                    </div>
                    <div className={styles.avatar}>
                        <User size={20} color="#94A3B8" />
                    </div>
                    <Link href="/Frontend">
                        <button className={styles.logoutButton} title="Logout">
                            <LogOut size={20} />
                        </button>
                    </Link>
                </div>
            </header>

            {/* Main Content Area */}
            <main className={styles.mainContent}>
                {children}
            </main>
        </div>
    );
}
