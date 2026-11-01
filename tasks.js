
export const LINK_TASKS = Array.from({ length: 10 }, (_, index) => ({
  id: `link_${index + 1}`,
  title: `Website Task ${index + 1}`,
  url: "https://asiafilm.org/4/b2bb499d8d084e87ca1c63825be193ea",
  durationSeconds: 15,
  rewardEnabled: false,
  active: true
}));

export const MONETAG_TASKS = Array.from({ length: 10 }, (_, index) => ({
  id: `monetag_${index + 1}`,
  title: `Watch Monetag Ad ${index + 1}`,
  network: "Monetag",
  zoneId: "12165220",
  requestVar: `monetag_task_${index + 1}`,
  reward: 10,
  active: true
}));

export function getActiveTasks() {
  return {
    linkTasks: LINK_TASKS.filter(task => task.active),
    monetagTasks: MONETAG_TASKS.filter(task => task.active)
  };
}

export function getTaskById(taskId) {
  return [
    ...LINK_TASKS,
    ...MONETAG_TASKS
  ].find(task => task.id === taskId) || null;
}
