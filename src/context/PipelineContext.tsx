import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchPipelineStages } from '../services/api';
import { useAuth } from './AuthContext';

interface PipelineStage {
    id: string;
    name: string;
    position: number;
    color: string;
}

interface PipelineContextType {
    stages: PipelineStage[];
    refreshStages: () => Promise<void>;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export const PipelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const [stages, setStages] = useState<PipelineStage[]>([]);

    const refreshStages = async () => {
        // Only fetch if authenticated
        if (!isAuthenticated) {
            console.log('Not authenticated, skipping stage fetch');
            return;
        }

        try {
            console.log('Fetching pipeline stages...');
            const fetchedStages = await fetchPipelineStages();
            console.log('Fetched stages:', fetchedStages);
            setStages(fetchedStages);
        } catch (error) {
            console.error('Failed to fetch pipeline stages:', error);
        }
    };

    useEffect(() => {
        refreshStages();
    }, [isAuthenticated]); // Re-fetch when authentication status changes

    return (
        <PipelineContext.Provider value={{ stages, refreshStages }}>
            {children}
        </PipelineContext.Provider>
    );
};

export const usePipeline = () => {
    const context = useContext(PipelineContext);
    if (!context) {
        throw new Error('usePipeline must be used within a PipelineProvider');
    }
    return context;
};
