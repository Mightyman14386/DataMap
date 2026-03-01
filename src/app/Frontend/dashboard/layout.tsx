"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LogOut, User } from "lucide-react";
import styles from "./dashboard.module.css";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

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

    const { data: session } = useSession();

    return (
        <div className={styles.dashboardContainer}>
            {/* Animated Grid Background */}
            <div className={styles.gridBackground} />

            {/* Top Navigation Bar */}
            <header className={styles.topNav}>
                <div className={styles.logo}>
                    <img src="/logo.svg" alt="DataMap Logo" className={styles.logoIcon} width={28} height={28} style={{ borderRadius: '50%' }} />
                    <span>DataMap</span>
                </div>

                <div className={styles.userProfile}>
                    <div className={styles.userInfo}>
                        <span className={styles.userName}>{session?.user?.name ?? "Loading..."}</span>
                        <span className={styles.userEmail}>{session?.user?.email ?? ""}</span>
                    </div>
                    <div className={styles.avatar}>
                        <User size={20} color="#94A3B8" />
                    </div>
                    <Link href="/Frontend">
                        <button
                            className={styles.logoutButton}
                            title="Logout"
                            onClick={() => signOut({ callbackUrl: "/Frontend" })}
                        >
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
