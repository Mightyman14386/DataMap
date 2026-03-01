/**
 * Privacy Engine - Main exports
 * Server-side utilities for policy analysis and risk scoring
 */

// Analysis service - core LLM and breach checking logic
export {
	fetchPrivacyPolicyText,
	analyzePrivacyPolicy,
	checkDataBreach,
	analyzeService,
	type PolicyAnalysis,
	type DeletionInfo,
	type BreachInfo,
} from "./analysis-service";

// Client utilities - frontend API helpers
export {
	configurePrivacyEngine,
	setAuthToken,
	analyzeServices,
	analyzePolicy,
	checkBreach,
	scoreService,
	getUserServices,
	getPrioritizedDeleteList,
	getServicesByTier,
	getServiceStats,
	formatRiskScore,
	getTierColor,
	extractDomainFromEmail,
	convertEmailsToServices,
	type RiskTier,
	type AnalyzedService,
	type AnalysisResult,
	type DiscoveredServiceInput,
} from "./client";

// Risk scoring engine
export {
	scoreServiceRisk,
	type ServiceInput,
	type RiskScore,
} from "../risk/engine";
