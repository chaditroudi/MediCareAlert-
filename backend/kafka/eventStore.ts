// In-memory circular buffer for Kafka events — accessible via REST + Socket.io
export interface KafkaEvent {
  id: string;
  topic: string;
  action: string;
  data: Record<string, any>;
  result: 'processed' | 'skipped' | 'error';
  detail?: string;
  timestamp: string;
}

const MAX_EVENTS = 500;
const events: KafkaEvent[] = [];
let counter = 0;

const topicStats: Record<string, { total: number; lastAt: string; errors: number }> = {};

export const pushEvent = (
  topic: string,
  action: string,
  data: Record<string, any>,
  result: 'processed' | 'skipped' | 'error',
  detail?: string,
): KafkaEvent => {
  const ev: KafkaEvent = {
    id: `ke-${++counter}`,
    topic,
    action,
    data,
    result,
    detail,
    timestamp: new Date().toISOString(),
  };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();

  if (!topicStats[topic]) topicStats[topic] = { total: 0, lastAt: '', errors: 0 };
  topicStats[topic].total++;
  topicStats[topic].lastAt = ev.timestamp;
  if (result === 'error') topicStats[topic].errors++;

  return ev;
};

export const getRecentEvents = (limit = 100, topicFilter?: string): KafkaEvent[] => {
  let list = topicFilter ? events.filter(e => e.topic === topicFilter) : events;
  return list.slice(-limit).reverse();
};

export const getTopicStats = () => ({ ...topicStats });

export const getTotalCount = () => counter;
