import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { AgentPipeline } from '../agents/pipeline.js';

interface Props {
  pipeline: AgentPipeline;
}

export const PipelineUI: React.FC<Props> = ({ pipeline }) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<string>('Waiting for input...');
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [idea, setIdea] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [streamText, setStreamText] = useState<string>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<{ score: number, approved: boolean, totalTokens: number } | null>(null);

  useEffect(() => {
    const onStart = (data: { agent: string, runId: string }) => {
      setCurrentAgent(data.agent);
      setStatus(`Running ${data.agent}...`);
      setStreamText('');
      setRunId(data.runId);
      setCompletionData(null);
    };

    const onStream = (data: { agent: string, token: string }) => {
      setStreamText(prev => (prev + data.token).slice(-200)); // Keep last 200 chars
    };

    const onDone = (data: { agent: string }) => {
      setStatus(`${data.agent} completed.`);
      setStreamText('');
    };

    const onPipelineDone = (data: { runId: string, score: number, approved: boolean, totalTokens: number }) => {
      setStatus(`Pipeline completed!`);
      setCompletionData({ score: data.score, approved: data.approved, totalTokens: data.totalTokens });
      setCurrentAgent(null);
      setStreamText('');
    };

    const onError = (data: { error: any }) => {
      const message = typeof data.error === 'string' 
        ? data.error 
        : (data.error?.message || JSON.stringify(data.error));
      setStatus(`Error: ${message}`);
      setIsSubmitted(false);
    };

    pipeline.on('agent_start', onStart);
    pipeline.on('agent_stream', onStream);
    pipeline.on('agent_done', onDone);
    pipeline.on('pipeline_done', onPipelineDone);
    pipeline.on('pipeline_error', onError);

    return () => {
      pipeline.off('agent_start', onStart);
      pipeline.off('agent_stream', onStream);
      pipeline.off('agent_done', onDone);
      pipeline.off('pipeline_done', onPipelineDone);
      pipeline.off('pipeline_error', onError);
    };
  }, [pipeline]);

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    setIdea(value);
    setIsSubmitted(true);
    setStatus('Initializing pipeline...');
    pipeline.enqueue(value).catch(err => {
      setStatus(`Failed to start: ${err.message}`);
      setIsSubmitted(false);
    });
  };

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
      <Box marginBottom={1}>
        <Text color="amber" bold>SPEC-TO-SHIP PIPELINE</Text>
      </Box>
      
      {!isSubmitted ? (
        <Box flexDirection="column">
          <Text>Enter your feature idea:</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <TextInput value={idea} onChange={setIdea} onSubmit={handleSubmit} />
          </Box>
          <Text color="gray" dimColor> (Press Enter to start, Esc to exit)</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text>Status: </Text>
            <Text color="cyan">{status}</Text>
          </Box>

          {runId && (
            <Box>
              <Text color="gray">Run ID: {runId}</Text>
            </Box>
          )}

          {completionData && (
            <Box flexDirection="column" marginTop={1} padding={1} borderStyle="double" borderColor="green">
              <Text color="green" bold underline>✓ PIPELINE EXECUTION SUCCESSFUL</Text>
              <Box marginTop={1}>
                <Text bold>Final Score: </Text>
                <Text color={completionData.score >= 75 ? "green" : "red"} bold>{completionData.score}/100</Text>
              </Box>
              <Box>
                <Text bold>Status: </Text>
                <Text bold>{completionData.approved ? "APPROVED ✅" : "REJECTED ❌"}</Text>
              </Box>
              <Box>
                <Text bold>Total Tokens: </Text>
                <Text color="cyan">{completionData.totalTokens.toLocaleString()}</Text>
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text bold color="amber">Output Directory:</Text>
                <Text color="white" bold>/root/SpecShip/output/{runId}</Text>
              </Box>
            </Box>
          )}

          {currentAgent && (
            <Box flexDirection="column" marginTop={1}>
              <Box>
                <Text color="yellow">
                  <Spinner type="dots" />
                </Text>
                <Text> Agent: </Text>
                <Text color="magenta" bold>{currentAgent.toUpperCase()}</Text>
              </Box>
              <Box marginTop={1} padding={1} borderStyle="classic" borderColor="blue">
                <Text italic color="white">{streamText || 'Waiting for tokens...'}</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
