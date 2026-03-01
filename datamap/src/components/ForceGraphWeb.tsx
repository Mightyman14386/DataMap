"use client";

import { useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods } from "react-force-graph-2d";

interface Node {
    id: string;
    name: string;
    val: number;
    color: string;
    group: number;
    emailNode?: boolean;
}

interface Link {
    source: string;
    target: string;
}

interface ForceGraphWebProps {
    nodes: Node[];
    links: Link[];
    onNodeClick: (node: Node) => void;
}

export default function ForceGraphWeb({ nodes, links, onNodeClick }: ForceGraphWebProps) {
    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight || 400,
                });
            }
        };

        updateDimensions();
        window.addEventListener("resize", updateDimensions);
        return () => window.removeEventListener("resize", updateDimensions);
    }, []);

    // Slight delay to center graph on initial load
    useEffect(() => {
        const timer = setTimeout(() => {
            if (fgRef.current) {
                fgRef.current.zoomToFit(400, 50);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: "400px" }}>
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={{ nodes, links }}
                nodeLabel="name"
                nodeColor={(node: any) => node.color}
                nodeVal={(node: any) => node.val}
                linkColor={() => "rgba(30, 41, 59, 0.8)"}
                linkWidth={1}
                onNodeClick={(node: any) => onNodeClick(node)}
                backgroundColor="transparent"
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = node.emailNode ? 16 / globalScale : 12 / globalScale;

                    // Draw Glow
                    ctx.shadowColor = node.color;
                    ctx.shadowBlur = 10;

                    // Draw core circle
                    ctx.beginPath();
                    const size = Math.sqrt(node.val) * 2;
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                    ctx.fillStyle = node.color;
                    ctx.fill();

                    // Draw border
                    ctx.lineWidth = 1 / globalScale;
                    ctx.strokeStyle = node.emailNode ? "#FFFFFF" : node.color;
                    ctx.stroke();

                    // Optional: Draw text above node
                    if (globalScale > 1.5) {
                        ctx.font = `${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillStyle = "#E2E8F0";
                        ctx.fillText(label, node.x, node.y + size + 4);
                    }

                    // Reset shadow for performance
                    ctx.shadowBlur = 0;
                }}
            />
        </div>
    );
}
