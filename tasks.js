export const TASKS = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `monetag_${i + 1}`,
    title: `Monetag Task ${i + 1}`,
    network: "Monetag",
    reward: 10,
    active: true
  })),

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `adsterra_${i + 1}`,
    title: `Adsterra Task ${i + 1}`,
    network: "Adsterra",
    reward: 10,
    active: true
  }))
];

export function getActiveTasks() {
  return TASKS.filter(task => task.active);
}

export function getTaskById(taskId) {
  return TASKS.find(task => task.id === taskId) || null;
}
