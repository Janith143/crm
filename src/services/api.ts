import { MOCK_PIPELINE_STAGES } from '../constants';

// In Electron, we need to use full URLs, not relative paths
const API_BASE = import.meta.env.DEV
    ? `http://localhost:${import.meta.env.VITE_PORT || 3001}/api`
    : `${import.meta.env.VITE_API_DOMAIN || 'https://crm.panoralink.com'}/api`;

export { API_BASE };

// Helper function to get auth headers
const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
};

export const fetchMetadata = async () => {
    try {
        const response = await fetch(`${API_BASE}/metadata`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) return {};
        const data = await response.json();
        return data.success ? data.metadata : {};
    } catch (error) {
        console.error("Failed to fetch metadata:", error);
        return {};
    }
};

export const updateMetadata = async (id: string, updates: any) => {
    const response = await fetch(`${API_BASE}/metadata/${id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
    });
    return response.json();
};

export const fetchAutomations = async () => {
    const response = await fetch(`${API_BASE}/automations`, {
        headers: getAuthHeaders()
    });
    const data = await response.json();
    return data.success ? data.rules : [];
};

export const createAutomation = async (rule: any) => {
    const response = await fetch(`${API_BASE}/automations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(rule)
    });
    return response.json();
};

export const updateAutomation = async (id: string, updates: any) => {
    const response = await fetch(`${API_BASE}/automations/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
    });
    return response.json();
};

export const deleteAutomation = async (id: string) => {
    const response = await fetch(`${API_BASE}/automations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    return response.json();
};

export const fetchPipelineStages = async () => {
    try {
        const response = await fetch(`${API_BASE}/pipeline-stages`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        return data.success ? data.stages : MOCK_PIPELINE_STAGES;
    } catch (error) {
        console.warn("API Error (fetchPipelineStages), using mock data.", error);
        return MOCK_PIPELINE_STAGES;
    }
};

export const createPipelineStage = async (stage: any) => {
    const response = await fetch(`${API_BASE}/pipeline-stages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(stage)
    });
    return response.json();
};

export const updatePipelineStage = async (id: string, updates: any) => {
    const response = await fetch(`${API_BASE}/pipeline-stages/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
    });
    return response.json();
};

export const deletePipelineStage = async (id: string) => {
    const response = await fetch(`${API_BASE}/pipeline-stages/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    return response.json();
};

export const reorderPipelineStages = async (stageIds: string[]) => {
    const response = await fetch(`${API_BASE}/pipeline-stages/reorder`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ stageIds })
    });
    return response.json();
};
