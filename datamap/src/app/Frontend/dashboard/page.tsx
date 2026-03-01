"use client";

import { useState } from "react";
import styles from "./page.module.css";
import {
    Activity, ShieldAlert, Users,
    ExternalLink, X, AlertTriangle,
    ShieldCheck, ChevronRight
} from "lucide-react";
import dynamic from "next/dynamic";

// Force graph needs to be dynamically imported because it uses window
const ForceGraphWeb = dynamic(() => import("~/components/ForceGraphWeb"), { ssr: false });

// Mock Data
const COLORS = {
    RED: "#FF003C",
    YELLOW: "#FFB000",
    GREEN: "#00FF41",
    BLUE: "#00F0FF"
};

const MOCK_SERVICES = [
    { id: "linkedin", name: "LinkedIn", risk: "RED", category: "Social", dataSelling: "High", aiTraining: "Yes", summary: "LinkedIn recently updated policies to default-opt-in user data for generative AI training. High likelihood of your professional data being scraped or sold to third parties.", lastBreach: "2021", usage: "Frequent" },
    { id: "tiktok", name: "TikTok", risk: "RED", category: "Social", dataSelling: "High", aiTraining: "Yes", summary: "TikTok collects comprehensive biometric and device data. Strong concerns regarding data sharing with international entities and difficulty of permanent account deletion.", lastBreach: "N/A", usage: "Infrequent" },
    { id: "canva", name: "Canva", risk: "YELLOW", category: "Productivity", dataSelling: "Medium", aiTraining: "Yes", summary: "Canva uses user content to train its internal AI design tools by default. Modest risk of data leakage but no recent major breaches.", lastBreach: "2019", usage: "Frequent" },
    { id: "zoom", name: "Zoom", risk: "YELLOW", category: "Communication", dataSelling: "Low", aiTraining: "Yes", summary: "Zoom's policy allows the use of some telemetry for AI but explicitly forbids training on audio/video content without consent.", lastBreach: "2020", usage: "Frequent" },
    { id: "github", name: "GitHub", risk: "GREEN", category: "Dev", dataSelling: "Low", aiTraining: "Opt-in", summary: "GitHub maintains strong encryption and security standards. AI training on private repositories requires explicit opt-in.", lastBreach: "N/A", usage: "Frequent" },
    { id: "notion", name: "Notion", risk: "GREEN", category: "Productivity", dataSelling: "Low", aiTraining: "No", summary: "Notion boasts strict data privacy rules and does not sell your data or train AI on workspace content without explicit consent.", lastBreach: "N/A", usage: "Frequent" },
    { id: "pinterest", name: "Pinterest", risk: "YELLOW", category: "Social", dataSelling: "Medium", aiTraining: "Yes", summary: "Pinterest tracks external web behavior for ad targeting. Your boards are public by default.", lastBreach: "N/A", usage: "Rare" },
    { id: "adobe", name: "Adobe", risk: "RED", category: "Design", dataSelling: "Medium", aiTraining: "Yes", summary: "Adobe's updated TOS allows them to analyze user files for machine learning training, raising massive copyright and privacy concerns.", lastBreach: "2013", usage: "Rare" },
];

const MOCK_NODES = [
    { id: "user", name: "user@example.com", val: 50, color: COLORS.BLUE, group: 0, emailNode: true },
    ...MOCK_SERVICES.map(s => ({
        val: s.risk === "RED" ? 30 : s.risk === "YELLOW" ? 20 : 10,
        color: COLORS[s.risk as keyof typeof COLORS],
        group: s.risk === "RED" ? 1 : s.risk === "YELLOW" ? 2 : 3,
        ...s
    }))
];

const MOCK_LINKS = MOCK_SERVICES.map(s => ({ source: "user", target: s.id }));

export default function DashboardPage() {
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [selectedAccount, setSelectedAccount] = useState<any>(null);

    const filteredServices = MOCK_SERVICES.filter(
        (s) => activeFilter === "ALL" || s.risk === activeFilter
    );

    const totalAccounts = MOCK_SERVICES.length;
    const redRisks = MOCK_SERVICES.filter(s => s.risk === "RED").length;

    // Calculate a health score (0-100)
    const score = Math.round(100 - ((redRisks * 10) + (MOCK_SERVICES.filter(s => s.risk === "YELLOW").length * 5)) / totalAccounts * 10);

    return (
        <div>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>
                    <Activity className={styles.pageTitleIcon} />
                    DataMap Overview
                </h1>
            </div>

            {/* Top Widgets */}
            <div className={styles.dashboardGrid}>
                <div className={`${styles.widget} ${styles.widgetHalf}`}>
                    <div className={styles.widgetTitle}>
                        <Users size={16} /> Total Accounts Found
                    </div>
                    <div className={styles.widgetValue}>{totalAccounts}</div>
                    <div className={styles.widgetSubtext}>Across 6 categories</div>
                </div>

                <div className={`${styles.widget} ${styles.widgetHalf}`}>
                    <div className={styles.widgetTitle}>
                        <ShieldAlert size={16} color="#FF003C" /> Breach Alerts
                    </div>
                    <div className={`${styles.widgetValue} ${styles.valueRed}`}>{redRisks}</div>
                    <div className={styles.widgetSubtext}>High-risk policies or leaks</div>
                </div>

                <div className={`${styles.widget} ${styles.widgetHalf}`}>
                    <div className={styles.widgetTitle}>
                        <Activity size={16} color="#00FF41" /> Privacy Health
                    </div>
                    <div className={`${styles.widgetValue} ${score > 70 ? styles.valueGreen : styles.valueYellow}`}>{score}/100</div>
                    <div className={styles.widgetSubtext}>Moderate footprint</div>
                </div>

                {/* The Visual Web */}
                <div className={`${styles.widget} ${styles.widgetFull}`}>
                    <div className={styles.widgetTitle}>The Data Web</div>
                    <div className={styles.graphContainer}>
                        <ForceGraphWeb
                            nodes={MOCK_NODES}
                            links={MOCK_LINKS}
                            onNodeClick={(node) => {
                                if (!node.emailNode) {
                                    setSelectedAccount(node);
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Account Inventory */}
                <div className={`${styles.widget} ${styles.widgetFull}`}>
                    <div className={styles.inventoryHeader}>
                        <div className={styles.widgetTitle} style={{ margin: 0 }}>Account Inventory</div>
                        <div className={styles.inventoryFilter}>
                            <button onClick={() => setActiveFilter("ALL")} className={styles.filterBtn} data-active={activeFilter === "ALL"}>All</button>
                            <button onClick={() => setActiveFilter("RED")} className={styles.filterBtn} data-active={activeFilter === "RED"}>Critical</button>
                            <button onClick={() => setActiveFilter("YELLOW")} className={styles.filterBtn} data-active={activeFilter === "YELLOW"}>Warning</button>
                            <button onClick={() => setActiveFilter("GREEN")} className={styles.filterBtn} data-active={activeFilter === "GREEN"}>Safe</button>
                        </div>
                    </div>

                    <div className={styles.inventoryList}>
                        {filteredServices.map(service => (
                            <div key={service.id} className={styles.inventoryItem} onClick={() => setSelectedAccount(service)}>
                                <div className={styles.serviceName}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[service.risk as keyof typeof COLORS], boxShadow: `0 0 5px ${COLORS[service.risk as keyof typeof COLORS]}` }} />
                                    {service.name}
                                </div>
                                <div className={styles.serviceCategory}>{service.category}</div>
                                <div>
                                    <span className={`${styles.statusTag} ${service.risk === "RED" ? styles.statusRed : service.risk === "YELLOW" ? styles.statusYellow : styles.statusGreen}`}>
                                        {service.risk === "RED" && <AlertTriangle size={12} />}
                                        {service.risk === "GREEN" && <ShieldCheck size={12} />}
                                        {service.risk}
                                    </span>
                                </div>
                                <ChevronRight className={styles.actionIcon} size={20} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Account Details Modal */}
            {selectedAccount && (
                <div className={styles.modalOverlay} onClick={() => setSelectedAccount(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{selectedAccount.name}</h3>
                            <button className={styles.closeBtn} onClick={() => setSelectedAccount(null)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.summaryBox}>
                                <p className={styles.summaryText}>{selectedAccount.summary}</p>
                            </div>

                            <div className={styles.dataPointsGrid}>
                                <div className={styles.dataPoint}>
                                    <div className={styles.dataPointLabel}>Data Selling</div>
                                    <div className={styles.dataPointValue} style={{ color: selectedAccount.dataSelling === "High" ? COLORS.RED : "#E2E8F0" }}>
                                        {selectedAccount.dataSelling}
                                    </div>
                                </div>
                                <div className={styles.dataPoint}>
                                    <div className={styles.dataPointLabel}>AI Training Usage</div>
                                    <div className={styles.dataPointValue} style={{ color: selectedAccount.aiTraining === "Yes" ? COLORS.YELLOW : "#E2E8F0" }}>
                                        {selectedAccount.aiTraining}
                                    </div>
                                </div>
                                <div className={styles.dataPoint}>
                                    <div className={styles.dataPointLabel}>Known Breaches</div>
                                    <div className={styles.dataPointValue} style={{ color: selectedAccount.lastBreach !== "N/A" ? COLORS.RED : "#E2E8F0" }}>
                                        {selectedAccount.lastBreach}
                                    </div>
                                </div>
                                <div className={styles.dataPoint}>
                                    <div className={styles.dataPointLabel}>Recent Activity</div>
                                    <div className={styles.dataPointValue}>{selectedAccount.usage}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
