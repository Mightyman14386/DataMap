"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import {
    Activity, ShieldAlert, Users,
    ExternalLink, X, AlertTriangle,
    ShieldCheck, ChevronRight
} from "lucide-react";
import dynamic from "next/dynamic";

// Force graph needs to be dynamically imported because it uses window
const ForceGraphWeb = dynamic(() => import("~/components/ForceGraphWeb"), { ssr: false });

const COLORS = {
    RED: "#FF003C",
    YELLOW: "#FFB000",
    GREEN: "#00FF41",
    BLUE: "#00F0FF",
    NEUTRAL: "#808080"
};

export default function DashboardPage() {
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [selectedAccount, setSelectedAccount] = useState<any>(null);
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch real data from Firebase (cached results, not re-running scan)
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                
                // Set a 20 second timeout for the fetch
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);
                
                const response = await fetch("/Backend/api/dashboard/get-analysis", {
                    method: "GET",
                    credentials: "include",
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error("Failed to fetch analysis data");
                }
                
                const data = await response.json();
                
                // If no results, show empty state
                if (data.isEmpty || !data.results || data.results.length === 0) {
                    setServices([]);
                    setError("No analysis results found. Complete a scan first.");
                    setLoading(false);
                    return;
                }
                
                // Transform API response to UI format
                const transformedServices = data.results?.map((result: any) => {
                    // Use the tier field from backend (already calculated correctly)
                    // Backend returns: green, yellow, red, neutral
                    const tier = result.risk?.tier?.toLowerCase() || "yellow";
                    const riskMap: Record<string, string> = {
                        "red": "RED",
                        "yellow": "YELLOW",
                        "green": "GREEN",
                        "neutral": "NEUTRAL"
                    };
                    const risk = riskMap[tier] || "NEUTRAL";
                    
                    return {
                        id: result.service.domain?.replace(".", "-") || "unknown",
                        name: result.service.serviceName || "Unknown",
                        risk,
                        category: "Discovered",
                        dataSelling: result.policyAnalysis?.dataSelling >= 6 ? "High" : "Low",
                        aiTraining: result.policyAnalysis?.aiTraining >= 6 ? "Yes" : "No",
                        summary: result.policyAnalysis?.summary || "Analysis pending...",
                        lastBreach: result.breachInfo?.breachName || "N/A",
                        usage: "Active",
                        deletionInfo: result.deletionInfo ? {
                            availability: result.deletionInfo.availability || "unknown",
                            accountDeletionUrl: result.deletionInfo.accountDeletionUrl,
                            dataDeletionUrl: result.deletionInfo.dataDeletionUrl,
                            retentionWindow: result.deletionInfo.retentionWindow,
                            instructions: result.deletionInfo.instructions,
                            source: result.deletionInfo.source || "default",
                        } : null,
                    };
                }) || [];
                
                setServices(transformedServices);
                setError(null);
            } catch (err: any) {
                console.error("Failed to load dashboard data:", err);
                if (err.name === 'AbortError') {
                    setError("Dashboard load took too long. Try refreshing the page.");
                } else {
                    setError("Unable to load analysis results.");
                }
                setServices([]);
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, []);

    const filteredServices = services.filter(
        (s) => activeFilter === "ALL" || s.risk === activeFilter
    );

    const totalAccounts = services.length;
    const redRisks = services.filter(s => s.risk === "RED").length;
    const yellowRisks = services.filter(s => s.risk === "YELLOW").length;
    const neutralRisks = services.filter(s => s.risk === "NEUTRAL").length;
    const greenRisks = services.filter(s => s.risk === "GREEN").length;

    // Calculate a health score (0-100)
    // RED = -10 points, YELLOW = -5 points, NEUTRAL = -3 points, GREEN = 0 points
    const score = totalAccounts > 0 
      ? Math.round(100 - ((redRisks * 10 + yellowRisks * 5 + neutralRisks * 3) / totalAccounts) * 100 / 10)
      : 100;

    const graphNodes = [
        { id: "user", name: "Your Account", val: 50, color: COLORS.BLUE, group: 0, emailNode: true },
        ...services.map(s => ({
            id: s.id,
            name: s.name,
            val: s.risk === "RED" ? 30 : s.risk === "YELLOW" ? 20 : s.risk === "NEUTRAL" ? 15 : 10,
            color: COLORS[s.risk as keyof typeof COLORS],
            group: s.risk === "RED" ? 1 : s.risk === "YELLOW" ? 2 : s.risk === "NEUTRAL" ? 3 : 4,
            risk: s.risk,
            category: s.category
        }))
    ];

    const graphLinks = services.map(s => ({ source: "user", target: s.id }));

    if (loading) {
        return (
            <div>
                <div className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>
                        <Activity className={styles.pageTitleIcon} />
                        DataMap Overview
                    </h1>
                </div>
                <div className={styles.dashboardGrid}>
                    <div className={`${styles.widget} ${styles.widgetFull}`}>
                        <div style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
                            Loading your data...
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <div className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>
                        <Activity className={styles.pageTitleIcon} />
                        DataMap Overview
                    </h1>
                </div>
                <div className={styles.dashboardGrid}>
                    <div className={`${styles.widget} ${styles.widgetFull}`}>
                        <div style={{ textAlign: "center", padding: "2rem", color: "#FF6B6B" }}>
                            {error}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                    <div className={styles.widgetSubtext}>{totalAccounts === 0 ? "Scan your email to get started" : `${services.length} services discovered`}</div>
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
                    <div className={styles.widgetSubtext}>{score > 70 ? "Strong privacy" : score > 40 ? "Moderate footprint" : "High-risk footprint"}</div>
                </div>

                {/* The Visual Web */}
                {services.length > 0 && (
                <div className={`${styles.widget} ${styles.widgetFull}`}>
                    <div className={styles.widgetTitle}>The Data Web</div>
                    <div className={styles.graphContainer}>
                        <ForceGraphWeb
                            nodes={graphNodes}
                            links={graphLinks}
                            onNodeClick={(node) => {
                                if (!node.emailNode) {
                                    setSelectedAccount(node);
                                }
                            }}
                        />
                    </div>
                </div>
                )}

                {/* Account Inventory */}
                <div className={`${styles.widget} ${styles.widgetFull}`}>
                    <div className={styles.inventoryHeader}>
                        <div className={styles.widgetTitle} style={{ margin: 0 }}>Account Inventory</div>
                        <div className={styles.inventoryFilter}>
                            <button onClick={() => setActiveFilter("ALL")} className={styles.filterBtn} data-active={activeFilter === "ALL"}>All</button>
                            <button onClick={() => setActiveFilter("RED")} className={styles.filterBtn} data-active={activeFilter === "RED"}>Critical</button>
                            <button onClick={() => setActiveFilter("YELLOW")} className={styles.filterBtn} data-active={activeFilter === "YELLOW"}>Warning</button>
                            <button onClick={() => setActiveFilter("GREEN")} className={styles.filterBtn} data-active={activeFilter === "GREEN"}>Safe</button>
                            <button onClick={() => setActiveFilter("NEUTRAL")} className={styles.filterBtn} data-active={activeFilter === "NEUTRAL"}>Unknown</button>
                        </div>
                    </div>

                    <div className={styles.inventoryList}>
                        {filteredServices.map(service => (
                            <div key={service.id} className={styles.inventoryItem} onClick={() => setSelectedAccount(service)}>
                                <div className={styles.serviceName}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[service.risk as keyof typeof COLORS], boxShadow: `0 0 5px ${COLORS[service.risk as keyof typeof COLORS]}` }} />
                                    <div style={{ flex: 1 }}>
                                        {service.name}
                                        {service.lastBreach && service.lastBreach !== "N/A" && (
                                            <div style={{ fontSize: "0.75rem", color: COLORS.RED, marginTop: "0.25rem", fontWeight: "600" }}>
                                                ⚠ Breach: {service.lastBreach}
                                            </div>
                                        )}
                                    </div>
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

                            {/* Deletion Info Section */}
                            {selectedAccount.deletionInfo && (
                                <div style={{ marginTop: "2rem", padding: "1rem", borderRadius: "8px", backgroundColor: "#1a1f3a", borderLeft: `4px solid ${COLORS.BLUE}` }}>
                                    <div style={{ fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <ExternalLink size={16} color={COLORS.BLUE} />
                                        Account Deletion & Data Removal
                                    </div>
                                    
                                    <div style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
                                        <strong>Status:</strong> {selectedAccount.deletionInfo.availability === "available" ? "✓ Available" : selectedAccount.deletionInfo.availability === "limited" ? "⚠ Limited" : "? Unknown"}
                                    </div>

                                    {selectedAccount.deletionInfo.accountDeletionUrl && (
                                        <div style={{ marginBottom: "0.75rem" }}>
                                            <a 
                                                href={selectedAccount.deletionInfo.accountDeletionUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ 
                                                    color: COLORS.BLUE, 
                                                    textDecoration: "none", 
                                                    display: "flex", 
                                                    alignItems: "center", 
                                                    gap: "0.5rem",
                                                    fontSize: "0.9rem"
                                                }}
                                            >
                                                <ExternalLink size={14} /> Delete Account
                                            </a>
                                        </div>
                                    )}

                                    {selectedAccount.deletionInfo.dataDeletionUrl && (
                                        <div style={{ marginBottom: "0.75rem" }}>
                                            <a 
                                                href={selectedAccount.deletionInfo.dataDeletionUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ 
                                                    color: COLORS.BLUE, 
                                                    textDecoration: "none", 
                                                    display: "flex", 
                                                    alignItems: "center", 
                                                    gap: "0.5rem",
                                                    fontSize: "0.9rem"
                                                }}
                                            >
                                                <ExternalLink size={14} /> Delete Personal Data
                                            </a>
                                        </div>
                                    )}

                                    {selectedAccount.deletionInfo.retentionWindow && (
                                        <div style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
                                            <strong>Retention Window:</strong> {selectedAccount.deletionInfo.retentionWindow}
                                        </div>
                                    )}

                                    {selectedAccount.deletionInfo.instructions && (
                                        <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "#0f1629", borderRadius: "4px", fontSize: "0.85rem", lineHeight: "1.5" }}>
                                            <strong>Instructions:</strong>
                                            <p style={{ margin: "0.5rem 0 0 0", whiteSpace: "pre-wrap" }}>{selectedAccount.deletionInfo.instructions}</p>
                                        </div>
                                    )}

                                    {selectedAccount.deletionInfo.source && (
                                        <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#888" }}>
                                            Source: {selectedAccount.deletionInfo.source}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
