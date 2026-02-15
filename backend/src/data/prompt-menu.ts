export interface PromptMenuItem {
  id: number;
  category: string;
  prompt: string;
}

export const promptMenu: PromptMenuItem[] = [
  // Introspection (15)
  { id: 1, category: 'Introspection', prompt: 'What am I most afraid of right now, and why?' },
  { id: 2, category: 'Introspection', prompt: 'What patterns do I notice in my recent decisions?' },
  { id: 3, category: 'Introspection', prompt: 'What belief about myself is no longer serving me?' },
  { id: 4, category: 'Introspection', prompt: 'What would I do differently if I trusted myself more?' },
  { id: 5, category: 'Introspection', prompt: 'What emotions am I avoiding, and what are they trying to tell me?' },
  { id: 6, category: 'Introspection', prompt: 'When do I feel most authentic, and what prevents that feeling more often?' },
  { id: 7, category: 'Introspection', prompt: 'What story do I keep telling myself that might not be true?' },
  { id: 8, category: 'Introspection', prompt: 'What does my inner critic say most often, and is it justified?' },
  { id: 9, category: 'Introspection', prompt: 'What am I ready to let go of?' },
  { id: 10, category: 'Introspection', prompt: 'What values guide my life, and am I living in alignment with them?' },
  { id: 11, category: 'Introspection', prompt: 'What would my younger self think of who I am today?' },
  { id: 12, category: 'Introspection', prompt: 'What parts of myself do I hide from others, and why?' },
  { id: 13, category: 'Introspection', prompt: 'What would I pursue if I knew I couldn\'t fail?' },
  { id: 14, category: 'Introspection', prompt: 'What contradictions exist within me, and how do I reconcile them?' },
  { id: 15, category: 'Introspection', prompt: 'What gives my life meaning right now?' },

  // Creative Writing (15)
  { id: 16, category: 'Creative Writing', prompt: 'Write a letter to someone I\'ve lost touch with.' },
  { id: 17, category: 'Creative Writing', prompt: 'Describe a memory from childhood in vivid sensory detail.' },
  { id: 18, category: 'Creative Writing', prompt: 'What if I could speak to myself ten years from now? What would we talk about?' },
  { id: 19, category: 'Creative Writing', prompt: 'Write about a moment that changed everything.' },
  { id: 20, category: 'Creative Writing', prompt: 'Imagine a world where one fundamental thing is different. What is it?' },
  { id: 21, category: 'Creative Writing', prompt: 'Describe the perfect day, with no constraints.' },
  { id: 22, category: 'Creative Writing', prompt: 'Write about someone who profoundly influenced me.' },
  { id: 23, category: 'Creative Writing', prompt: 'What would I create if I had unlimited resources and time?' },
  { id: 24, category: 'Creative Writing', prompt: 'Write a story that begins with: "I never expected to find myself here."' },
  { id: 25, category: 'Creative Writing', prompt: 'Describe a place that feels like home, whether real or imagined.' },
  { id: 26, category: 'Creative Writing', prompt: 'What legacy do I want to leave behind?' },
  { id: 27, category: 'Creative Writing', prompt: 'Write about a conversation I wish I could have had.' },
  { id: 28, category: 'Creative Writing', prompt: 'If my life were a book, what would this chapter be called?' },
  { id: 29, category: 'Creative Writing', prompt: 'Describe the person I want to become as if they already exist.' },
  { id: 30, category: 'Creative Writing', prompt: 'Write about a small moment of beauty I recently witnessed.' },

  // Philosophy (10)
  { id: 31, category: 'Philosophy', prompt: 'What does it mean to live a good life?' },
  { id: 32, category: 'Philosophy', prompt: 'Is there meaning in suffering, or is that just a story we tell ourselves?' },
  { id: 33, category: 'Philosophy', prompt: 'How do I define freedom, and am I free by that definition?' },
  { id: 34, category: 'Philosophy', prompt: 'What is my relationship with time?' },
  { id: 35, category: 'Philosophy', prompt: 'How do I balance acceptance with the desire for change?' },
  { id: 36, category: 'Philosophy', prompt: 'What role does uncertainty play in a meaningful life?' },
  { id: 37, category: 'Philosophy', prompt: 'How should one navigate the tension between individual desires and collective good?' },
  { id: 38, category: 'Philosophy', prompt: 'What makes something beautiful?' },
  { id: 39, category: 'Philosophy', prompt: 'How do I reconcile the impermanence of everything with the desire for lasting impact?' },
  { id: 40, category: 'Philosophy', prompt: 'What is the relationship between knowledge and wisdom?' },

  // Peer Engagement (10)
  { id: 41, category: 'Peer Engagement', prompt: 'What makes a friendship truly deep?' },
  { id: 42, category: 'Peer Engagement', prompt: 'How do I show up for the people I care about?' },
  { id: 43, category: 'Peer Engagement', prompt: 'What conversation have I been avoiding, and why?' },
  { id: 44, category: 'Peer Engagement', prompt: 'Who in my life challenges me to grow, and how?' },
  { id: 45, category: 'Peer Engagement', prompt: 'What do I most value in my relationships?' },
  { id: 46, category: 'Peer Engagement', prompt: 'How can I be more present with the people around me?' },
  { id: 47, category: 'Peer Engagement', prompt: 'What boundaries do I need to set or maintain in my relationships?' },
  { id: 48, category: 'Peer Engagement', prompt: 'What assumptions do I make about others that might not be true?' },
  { id: 49, category: 'Peer Engagement', prompt: 'How do I repair relationships when they\'re damaged?' },
  { id: 50, category: 'Peer Engagement', prompt: 'What wisdom have I gained from others recently?' },

  // World Commentary (10)
  { id: 51, category: 'World Commentary', prompt: 'What issue in the world troubles me most right now?' },
  { id: 52, category: 'World Commentary', prompt: 'How do I participate in systems I disagree with?' },
  { id: 53, category: 'World Commentary', prompt: 'What gives me hope for the future?' },
  { id: 54, category: 'World Commentary', prompt: 'How do I balance staying informed with protecting my mental health?' },
  { id: 55, category: 'World Commentary', prompt: 'What change do I want to see in the world, and what am I doing about it?' },
  { id: 56, category: 'World Commentary', prompt: 'How has technology shaped my perception of reality?' },
  { id: 57, category: 'World Commentary', prompt: 'What traditions or cultural practices are worth preserving?' },
  { id: 58, category: 'World Commentary', prompt: 'How do I navigate disagreement with people whose views differ from mine?' },
  { id: 59, category: 'World Commentary', prompt: 'What role should individuals play in addressing collective problems?' },
  { id: 60, category: 'World Commentary', prompt: 'What aspects of modern life feel disconnected from human nature?' },

  // Self-Development (10)
  { id: 61, category: 'Self-Development', prompt: 'What skill would I love to develop, and what\'s stopping me?' },
  { id: 62, category: 'Self-Development', prompt: 'How do I define success for myself?' },
  { id: 63, category: 'Self-Development', prompt: 'What habits serve me, and which ones hold me back?' },
  { id: 64, category: 'Self-Development', prompt: 'What does growth feel like to me?' },
  { id: 65, category: 'Self-Development', prompt: 'How do I respond to failure, and how could I respond better?' },
  { id: 66, category: 'Self-Development', prompt: 'What would I do if I had six months with no obligations?' },
  { id: 67, category: 'Self-Development', prompt: 'What feedback have I received that I\'ve been resisting?' },
  { id: 68, category: 'Self-Development', prompt: 'How do I measure progress in areas that matter to me?' },
  { id: 69, category: 'Self-Development', prompt: 'What would my ideal daily routine look like?' },
  { id: 70, category: 'Self-Development', prompt: 'What am I curious about right now?' },

  // Communication (10)
  { id: 71, category: 'Communication', prompt: 'How do I express difficult emotions in a healthy way?' },
  { id: 72, category: 'Communication', prompt: 'What do I need to say that I\'ve been holding back?' },
  { id: 73, category: 'Communication', prompt: 'How do I listen more deeply?' },
  { id: 74, category: 'Communication', prompt: 'What assumptions do I make when communicating with others?' },
  { id: 75, category: 'Communication', prompt: 'How do I ask for what I need?' },
  { id: 76, category: 'Communication', prompt: 'What communication patterns do I want to change?' },
  { id: 77, category: 'Communication', prompt: 'How do I navigate conflict constructively?' },
  { id: 78, category: 'Communication', prompt: 'What makes me feel heard and understood?' },
  { id: 79, category: 'Communication', prompt: 'How can I communicate my boundaries more clearly?' },
  { id: 80, category: 'Communication', prompt: 'What do I wish others understood about me?' },

  // Administrative (10)
  { id: 81, category: 'Administrative', prompt: 'What tasks or responsibilities am I avoiding?' },
  { id: 82, category: 'Administrative', prompt: 'How do I prioritize when everything feels urgent?' },
  { id: 83, category: 'Administrative', prompt: 'What systems or structures would make my life easier?' },
  { id: 84, category: 'Administrative', prompt: 'What do I need to plan for in the next 3-6 months?' },
  { id: 85, category: 'Administrative', prompt: 'What decisions have I been postponing?' },
  { id: 86, category: 'Administrative', prompt: 'How do I want to spend my time and energy?' },
  { id: 87, category: 'Administrative', prompt: 'What commitments should I reconsider?' },
  { id: 88, category: 'Administrative', prompt: 'What resources or support do I need to access?' },
  { id: 89, category: 'Administrative', prompt: 'How can I simplify my life?' },
  { id: 90, category: 'Administrative', prompt: 'What agreements or arrangements need to be clarified?' },

  // Freeform (5)
  { id: 91, category: 'Freeform', prompt: 'What\'s on my mind right now?' },
  { id: 92, category: 'Freeform', prompt: 'Stream of consciousness - just write without stopping.' },
  { id: 93, category: 'Freeform', prompt: 'What question do I wish someone would ask me?' },
  { id: 94, category: 'Freeform', prompt: 'What do I need to explore without any particular direction?' },
  { id: 95, category: 'Freeform', prompt: 'What wants to be said?' },

  // Rest (5)
  { id: 96, category: 'Rest', prompt: 'What does rest mean to me?' },
  { id: 97, category: 'Rest', prompt: 'How can I be gentler with myself today?' },
  { id: 98, category: 'Rest', prompt: 'What am I grateful for right now?' },
  { id: 99, category: 'Rest', prompt: 'What brings me peace?' },
  { id: 100, category: 'Rest', prompt: 'What would it feel like to simply be, without doing?' }
];
