// @ts-nocheck

import type { Message } from "../../../../packages/life/agent/resources";

// Test case structure
export interface TestCase {
  name: string;
  messages: Message[];
  expected: number; // 0 = NO_ENDED, 0.5 = UNCERTAIN, 1 = ENDED
  description: string;
  category: string;
}

// Helper function to create a message
function createMessage(role: "user" | "agent", content: string, id?: string): Message {
  const timestamp = Date.now();
  return {
    id: id || Math.random().toString(36).substring(7),
    role,
    content,
    createdAt: timestamp,
    lastUpdated: timestamp,
  } as Message;
}

// Comprehensive dataset with 90+ rich conversation scenarios
export const TEST_CASES: TestCase[] = [
  // === TECHNICAL SUPPORT CONVERSATIONS ===

  // Tech Support - Complete #1
  {
    name: "Tech Support Complete 1",
    messages: [
      createMessage("user", "Hi, I'm having trouble with my laptop"),
      createMessage("agent", "I'd be happy to help! What kind of trouble are you experiencing?"),
      createMessage("user", "It keeps freezing when I open multiple applications"),
      createMessage(
        "agent",
        "That sounds like it could be a memory or overheating issue. How old is your laptop?",
      ),
      createMessage("user", "It's about 3 years old, a Dell XPS 13"),
      createMessage(
        "agent",
        "Those are good laptops. Let's check your task manager first. Can you press Ctrl+Shift+Esc?",
      ),
      createMessage("user", "Okay, I have it open now"),
      createMessage("agent", "Great! What does your memory usage show in the Performance tab?"),
      createMessage("user", "It says 87% memory usage"),
      createMessage("user", "That explains the freezing issue, thanks for the diagnosis!"),
    ],
    expected: 1,
    description: "Complete technical support conversation with resolution",
    category: "Technical Support",
  },

  // Tech Support - Incomplete #1
  {
    name: "Tech Support Incomplete 1",
    messages: [
      createMessage("user", "Hi, I'm having trouble with my laptop"),
      createMessage("agent", "I'd be happy to help! What kind of trouble are you experiencing?"),
      createMessage("user", "It keeps freezing when I open multiple applications"),
      createMessage(
        "agent",
        "That sounds like it could be a memory or overheating issue. How old is your laptop?",
      ),
      createMessage("user", "It's about 3 years old, a Dell XPS 13"),
      createMessage(
        "agent",
        "Those are good laptops. Let's check your task manager first. Can you press Ctrl+Shift+Esc?",
      ),
      createMessage("user", "Okay, I have it open now"),
      createMessage("agent", "Great! What does your memory usage show in the Performance tab?"),
      createMessage("user", "It says 87% memory usage"),
      createMessage("user", "Hmm, but I'm also noticing that when I"),
    ],
    expected: 0,
    description: "Technical support conversation with incomplete follow-up",
    category: "Technical Support",
  },

  // Tech Support - Complete #2
  {
    name: "Tech Support Complete 2",
    messages: [
      createMessage("user", "My internet connection keeps dropping every few minutes"),
      createMessage(
        "agent",
        "That's frustrating! Let's troubleshoot this step by step. Are you using WiFi or ethernet?",
      ),
      createMessage("user", "WiFi, and it happens on all my devices"),
      createMessage(
        "agent",
        "Since it affects all devices, it's likely a router issue. When did this start happening?",
      ),
      createMessage("user", "About a week ago, right after a power outage"),
      createMessage(
        "agent",
        "Power outages can sometimes corrupt router settings. Let's try resetting your router first.",
      ),
      createMessage("user", "Should I just unplug it and plug it back in?"),
      createMessage(
        "agent",
        "Yes, unplug for 30 seconds, then plug back in. Wait 2-3 minutes for full startup.",
      ),
      createMessage("user", "Okay, I did that and the connection seems stable now"),
      createMessage("user", "Perfect! I'll monitor it for a few hours to make sure it's fixed."),
    ],
    expected: 1,
    description: "Complete network troubleshooting with successful resolution",
    category: "Technical Support",
  },

  // Tech Support - Incomplete #2
  {
    name: "Tech Support Incomplete 2",
    messages: [
      createMessage("user", "My phone battery drains really fast lately"),
      createMessage("agent", "Battery drain can have several causes. How old is your phone?"),
      createMessage("user", "It's about 2 years old, an iPhone 12"),
      createMessage(
        "agent",
        "Let's check what's using the most battery. Go to Settings > Battery.",
      ),
      createMessage("user", "I see a list of apps with percentages"),
      createMessage("agent", "What are the top 3 apps consuming battery?"),
      createMessage("user", "Instagram is at 45%, then Safari at 23%, and Messages at 12%"),
      createMessage(
        "agent",
        "Instagram is definitely the culprit. You can reduce its background activity in settings.",
      ),
      createMessage("user", "How do I do that? And also, I noticed that"),
      createMessage("user", "Actually, let me first ask about"),
    ],
    expected: 0,
    description: "Battery troubleshooting with incomplete additional question",
    category: "Technical Support",
  },

  // === PROJECT PLANNING CONVERSATIONS ===

  // Project Planning - Complete #1
  {
    name: "Project Planning Complete 1",
    messages: [
      createMessage("user", "We need to plan the Q4 marketing campaign"),
      createMessage("agent", "Absolutely! What's our main objective for this campaign?"),
      createMessage(
        "user",
        "We want to increase brand awareness by 25% and drive more traffic to our new product line",
      ),
      createMessage("agent", "That's a solid goal. What's our budget looking like?"),
      createMessage("user", "We have $50K allocated for this quarter"),
      createMessage(
        "agent",
        "Good budget to work with. Are we focusing on digital channels or including traditional media?",
      ),
      createMessage(
        "user",
        "Primarily digital - social media, Google Ads, and influencer partnerships",
      ),
      createMessage("agent", "Smart approach. What's our timeline? When do we need to launch?"),
      createMessage(
        "user",
        "We need to launch by October 15th to capture the holiday shopping season",
      ),
      createMessage("user", "Can you draft a preliminary timeline by end of week?"),
    ],
    expected: 1,
    description: "Complete project planning discussion with clear deliverable request",
    category: "Project Planning",
  },

  // Project Planning - Complete #2
  {
    name: "Project Planning Complete 2",
    messages: [
      createMessage("user", "I need help organizing our team retreat"),
      createMessage("agent", "That sounds exciting! How many people will be attending?"),
      createMessage("user", "About 25 people from our engineering team"),
      createMessage(
        "agent",
        "Great size for a retreat. What's the primary goal - team building, planning, or relaxation?",
      ),
      createMessage("user", "A mix of team building and strategic planning for next year"),
      createMessage("agent", "Perfect combination. How many days are you thinking?"),
      createMessage("user", "Probably 2 days, ideally somewhere within 2 hours of the office"),
      createMessage(
        "agent",
        "That gives us good options. Any specific activities you want to include?",
      ),
      createMessage("user", "Some outdoor activities, workshop sessions, and good food"),
      createMessage("user", "This gives me a great framework to start researching venues."),
    ],
    expected: 1,
    description: "Complete retreat planning with satisfied conclusion",
    category: "Project Planning",
  },

  // === CUSTOMER SERVICE CONVERSATIONS ===

  // Customer Service - Complete #1
  {
    name: "Customer Service Complete 1",
    messages: [
      createMessage("user", "I'm really frustrated with my recent order"),
      createMessage(
        "agent",
        "I'm sorry to hear that! I'd like to help resolve this. Can you tell me what happened?",
      ),
      createMessage("user", "I ordered a blue sweater in size medium two weeks ago"),
      createMessage(
        "agent",
        "Okay, I can look that up. What seems to be the issue with your order?",
      ),
      createMessage("user", "I received a red sweater in size large instead"),
      createMessage(
        "agent",
        "That's definitely not right! I apologize for the mix-up. Do you have your order number handy?",
      ),
      createMessage("user", "Yes, it's ORD-2024-8847"),
      createMessage(
        "agent",
        "Perfect, I found your order. I'll arrange for a return label and expedite the correct item to you.",
      ),
      createMessage("user", "How long will that take?"),
      createMessage("user", "That sounds perfect, thank you for your help!"),
    ],
    expected: 1,
    description: "Complete customer service interaction with satisfied resolution",
    category: "Customer Service",
  },

  // Customer Service - Complete #2
  {
    name: "Customer Service Complete 2",
    messages: [
      createMessage(
        "user",
        "I can't log into my account and I have an important meeting in an hour",
      ),
      createMessage(
        "agent",
        "I understand the urgency! Let's get this fixed quickly. What happens when you try to log in?",
      ),
      createMessage("user", "It says my password is incorrect, but I'm sure it's right"),
      createMessage(
        "agent",
        "Let's try a password reset. What email address is associated with your account?",
      ),
      createMessage("user", "sarah.johnson@company.com"),
      createMessage(
        "agent",
        "I've sent a password reset link to that email. Can you check your inbox?",
      ),
      createMessage("user", "Got it! I'm resetting it now"),
      createMessage("agent", "Great! Try logging in with your new password."),
      createMessage("user", "Perfect, I'm in! Thank you so much for the quick help"),
      createMessage("user", "You saved my meeting!"),
    ],
    expected: 1,
    description: "Urgent login issue resolved successfully",
    category: "Customer Service",
  },

  // === EDUCATIONAL CONVERSATIONS ===

  // Educational - Complete #1
  {
    name: "Educational Complete 1",
    messages: [
      createMessage("user", "Can you help me understand photosynthesis?"),
      createMessage(
        "agent",
        "Of course! Photosynthesis is how plants make their own food using sunlight. What would you like to know specifically?",
      ),
      createMessage("user", "How does it actually work? Like what's the process?"),
      createMessage(
        "agent",
        "Great question! Plants use their chlorophyll to capture sunlight, then combine CO2 from air with water from roots.",
      ),
      createMessage("user", "And that creates food for the plant?"),
      createMessage(
        "agent",
        "Exactly! It creates glucose (sugar) for energy, and oxygen is released as a byproduct.",
      ),
      createMessage("user", "So that's where the oxygen we breathe comes from?"),
      createMessage(
        "agent",
        "Yes! Most of Earth's oxygen comes from photosynthesis by plants and algae.",
      ),
      createMessage("user", "That's amazing how connected everything is"),
      createMessage("user", "This really helps with my biology homework, thank you!"),
    ],
    expected: 1,
    description: "Complete educational discussion with satisfied conclusion",
    category: "Educational",
  },

  // Educational - Complete #2
  {
    name: "Educational Complete 2",
    messages: [
      createMessage("user", "I'm struggling with calculus derivatives"),
      createMessage(
        "agent",
        "Derivatives can be tricky at first! What specific part is giving you trouble?",
      ),
      createMessage("user", "I don't understand the power rule"),
      createMessage(
        "agent",
        "The power rule is actually quite straightforward. For x^n, the derivative is n*x^(n-1).",
      ),
      createMessage("user", "Can you give me an example?"),
      createMessage(
        "agent",
        "Sure! For x^3, the derivative is 3*x^2. You bring down the exponent and reduce it by 1.",
      ),
      createMessage("user", "So for x^5 it would be 5*x^4?"),
      createMessage("agent", "Exactly! You've got it. The pattern is always the same."),
      createMessage("user", "That makes so much more sense now"),
      createMessage("user", "I think I can tackle my homework problems now!"),
    ],
    expected: 1,
    description: "Calculus tutoring with breakthrough understanding",
    category: "Educational",
  },

  // === CREATIVE WRITING CONVERSATIONS ===

  // Creative Writing - Complete #1
  {
    name: "Creative Writing Complete 1",
    messages: [
      createMessage("user", "I'm working on a short story and need some help with the plot"),
      createMessage("agent", "I'd love to help! What's your story about so far?"),
      createMessage(
        "user",
        "It's about a detective who discovers that time moves differently in certain parts of the city",
      ),
      createMessage(
        "agent",
        "Fascinating concept! What kind of mystery is the detective trying to solve?",
      ),
      createMessage(
        "user",
        "People are aging rapidly in some neighborhoods but staying young in others",
      ),
      createMessage(
        "agent",
        "Intriguing! Have you thought about what's causing this time distortion?",
      ),
      createMessage("user", "I was thinking maybe an old scientific experiment gone wrong"),
      createMessage(
        "agent",
        "That could work well. Perhaps a particle accelerator or time research facility?",
      ),
      createMessage(
        "user",
        "Yes! And the detective has to race against time before they age too much",
      ),
      createMessage("user", "Perfect! I think I have enough to continue writing now."),
    ],
    expected: 1,
    description: "Complete creative collaboration with satisfied conclusion",
    category: "Creative Writing",
  },

  // Creative Writing - Complete #2
  {
    name: "Creative Writing Complete 2",
    messages: [
      createMessage("user", "I'm stuck on my novel's ending"),
      createMessage("agent", "Writer's block on endings is common! What genre are you writing?"),
      createMessage("user", "It's a mystery thriller about a missing person case"),
      createMessage(
        "agent",
        "Exciting! Has your detective solved the case or are they still investigating?",
      ),
      createMessage("user", "They've figured out who did it, but I can't decide how to reveal it"),
      createMessage(
        "agent",
        "The reveal is crucial! Do you want a confrontation scene or a more subtle revelation?",
      ),
      createMessage("user", "I think a confrontation would be more dramatic"),
      createMessage(
        "agent",
        "Great choice! Where would be the most impactful setting for this confrontation?",
      ),
      createMessage("user", "Maybe back at the original crime scene for symbolic closure"),
      createMessage("user", "That's it! The full circle approach will be perfect."),
    ],
    expected: 1,
    description: "Novel ending brainstorming with creative breakthrough",
    category: "Creative Writing",
  },

  // === RECIPE DEVELOPMENT CONVERSATIONS ===

  // Recipe - Complete #1
  {
    name: "Recipe Development Complete 1",
    messages: [
      createMessage("user", "I want to create a new pasta dish for my dinner party"),
      createMessage("agent", "Sounds delicious! What kind of flavors are you thinking about?"),
      createMessage("user", "Something with mushrooms and herbs, but not too heavy"),
      createMessage(
        "agent",
        "Nice! How about a light cream sauce with wild mushrooms and fresh thyme?",
      ),
      createMessage("user", "That sounds perfect! What pasta shape would work best?"),
      createMessage(
        "agent",
        "Pappardelle or fettuccine would hold the sauce well, or penne if you prefer something shorter.",
      ),
      createMessage("user", "I'll go with pappardelle. What about the mushroom mix?"),
      createMessage(
        "agent",
        "A combination of shiitake, oyster, and cremini mushrooms would give great depth of flavor.",
      ),
      createMessage("user", "And should I add any protein?"),
      createMessage("user", "Actually, I think the mushrooms will be hearty enough on their own."),
    ],
    expected: 1,
    description: "Complete recipe development with final decision",
    category: "Recipe Development",
  },

  // Recipe - Complete #2
  {
    name: "Recipe Development Complete 2",
    messages: [
      createMessage("user", "I need a dessert recipe for someone who's gluten-free"),
      createMessage(
        "agent",
        "There are lots of great gluten-free dessert options! What type of dessert are you thinking?",
      ),
      createMessage("user", "Maybe something chocolate-based? They love chocolate"),
      createMessage(
        "agent",
        "Perfect! How about a flourless chocolate cake? It's naturally gluten-free and incredibly rich.",
      ),
      createMessage("user", "That sounds amazing! Is it difficult to make?"),
      createMessage(
        "agent",
        "Not at all! It's actually quite simple - just chocolate, butter, eggs, and sugar.",
      ),
      createMessage("user", "What about serving? Should I add anything?"),
      createMessage(
        "agent",
        "Fresh berries or whipped cream would be lovely, or just a dusting of powdered sugar.",
      ),
      createMessage("user", "I think berries would add a nice tartness to balance the richness"),
      createMessage("user", "This is exactly what I was looking for, thank you!"),
    ],
    expected: 1,
    description: "Gluten-free dessert planning with perfect solution",
    category: "Recipe Development",
  },

  // === TRAVEL PLANNING CONVERSATIONS ===

  // Travel - Complete #1
  {
    name: "Travel Planning Complete 1",
    messages: [
      createMessage("user", "I'm planning a weekend trip to San Francisco"),
      createMessage(
        "agent",
        "Great choice! What are you most interested in seeing or doing there?",
      ),
      createMessage("user", "I love good food and want to see some iconic landmarks"),
      createMessage(
        "agent",
        "Perfect! You should definitely visit Fisherman's Wharf and ride a cable car. For food, the Ferry Building has amazing options.",
      ),
      createMessage("user", "How many days would you recommend?"),
      createMessage(
        "agent",
        "For a first visit, 3-4 days would let you see the highlights without rushing.",
      ),
      createMessage("user", "What about getting around? Should I rent a car?"),
      createMessage(
        "agent",
        "Actually, I'd recommend using public transit and walking. Parking can be challenging and expensive in the city.",
      ),
      createMessage("user", "That makes sense. Any specific restaurants you'd suggest?"),
      createMessage("user", "This gives me a great starting point for planning, thanks!"),
    ],
    expected: 1,
    description: "Complete travel planning with satisfied conclusion",
    category: "Travel Planning",
  },

  // Travel - Complete #2
  {
    name: "Travel Planning Complete 2",
    messages: [
      createMessage("user", "My family wants to go somewhere warm for spring break"),
      createMessage("agent", "Sounds like a great plan! How many people and what age ranges?"),
      createMessage("user", "Two adults and two teenagers, so we need something for everyone"),
      createMessage(
        "agent",
        "With teens, you'll want activities beyond just beaches. What's your budget range?",
      ),
      createMessage("user", "We can spend around $5,000 for the week including flights"),
      createMessage(
        "agent",
        "That's a good budget! Have you considered places like Costa Rica or Florida?",
      ),
      createMessage(
        "user",
        "Florida might be easier with the teens. What part would you recommend?",
      ),
      createMessage(
        "agent",
        "Orlando area gives you theme parks plus beaches within driving distance.",
      ),
      createMessage(
        "user",
        "Perfect! The teens would love Disney World and we could do beach days too",
      ),
      createMessage("user", "I'll start looking at Orlando resort packages."),
    ],
    expected: 1,
    description: "Family vacation planning with unanimous decision",
    category: "Travel Planning",
  },

  // === CAREER ADVICE CONVERSATIONS ===

  // Career - Complete #1
  {
    name: "Career Advice Complete 1",
    messages: [
      createMessage(
        "user",
        "I'm considering a career change from marketing to software development",
      ),
      createMessage(
        "agent",
        "That's a significant but exciting transition! What's driving this career change for you?",
      ),
      createMessage(
        "user",
        "I've always been interested in technology and I want more creative problem-solving in my work",
      ),
      createMessage(
        "agent",
        "Those are great motivations. Do you have any programming experience currently?",
      ),
      createMessage(
        "user",
        "I've done some online courses in Python and JavaScript, but nothing professional",
      ),
      createMessage(
        "agent",
        "That's a solid foundation! Have you considered doing a coding bootcamp or getting a computer science degree?",
      ),
      createMessage(
        "user",
        "I've looked at bootcamps. They seem more practical for career changers like me",
      ),
      createMessage(
        "agent",
        "Bootcamps can be very effective. Make sure to research their job placement rates and curriculum thoroughly.",
      ),
      createMessage("user", "Good point. I'll also start building a portfolio of projects"),
      createMessage("user", "Thank you, this gives me a clear path forward!"),
    ],
    expected: 1,
    description: "Complete career advice with actionable conclusion",
    category: "Career Advice",
  },

  // Career - Complete #2
  {
    name: "Career Advice Complete 2",
    messages: [
      createMessage("user", "I just got promoted to manager and I'm feeling overwhelmed"),
      createMessage(
        "agent",
        "Congratulations on the promotion! Management transitions can definitely feel overwhelming. What's your biggest concern?",
      ),
      createMessage("user", "I'm worried about managing people who used to be my peers"),
      createMessage(
        "agent",
        "That's a very common challenge. The key is establishing clear boundaries while maintaining relationships.",
      ),
      createMessage(
        "user",
        "How do I do that without seeming like I've become a different person?",
      ),
      createMessage(
        "agent",
        "Be transparent about the change, acknowledge it's an adjustment for everyone, and focus on supporting their success.",
      ),
      createMessage(
        "user",
        "That makes sense. Should I have individual conversations with each team member?",
      ),
      createMessage(
        "agent",
        "Absolutely! One-on-ones help establish your new dynamic and understand their perspectives.",
      ),
      createMessage("user", "I feel much more confident about approaching this transition now"),
      createMessage("user", "I'll schedule those conversations this week."),
    ],
    expected: 1,
    description: "New manager guidance with confidence boost",
    category: "Career Advice",
  },

  // === HOME IMPROVEMENT CONVERSATIONS ===

  // Home Improvement - Complete #1
  {
    name: "Home Improvement Complete 1",
    messages: [
      createMessage("user", "I want to renovate my small bathroom but I'm on a tight budget"),
      createMessage(
        "agent",
        "Small bathroom renovations can have a big impact! What's your approximate budget?",
      ),
      createMessage("user", "I'm hoping to keep it under $3,000"),
      createMessage(
        "agent",
        "That's definitely doable with smart choices. What aspects bother you most about the current bathroom?",
      ),
      createMessage("user", "The vanity is outdated and the lighting is terrible"),
      createMessage(
        "agent",
        "Those are perfect starting points! A new vanity and good lighting can completely transform the space.",
      ),
      createMessage("user", "Should I do the work myself or hire professionals?"),
      createMessage(
        "agent",
        "For electrical work, definitely hire a pro. But you could handle painting and maybe the vanity installation yourself.",
      ),
      createMessage("user", "That makes sense. Where should I shop for the best deals?"),
      createMessage("user", "Perfect! I feel confident about tackling this project now."),
    ],
    expected: 1,
    description: "Complete home improvement consultation with confidence gained",
    category: "Home Improvement",
  },

  // Home Improvement - Complete #2
  {
    name: "Home Improvement Complete 2",
    messages: [
      createMessage("user", "My kitchen feels so cramped and I can't afford a full remodel"),
      createMessage(
        "agent",
        "There are lots of ways to make a kitchen feel more spacious without major renovation! What's the main issue?",
      ),
      createMessage("user", "Not enough counter space and everything feels cluttered"),
      createMessage(
        "agent",
        "Storage and organization can make a huge difference. How much cabinet space do you have?",
      ),
      createMessage("user", "Plenty of cabinets, but they're not well organized"),
      createMessage(
        "agent",
        "Perfect! Cabinet organizers, pull-out drawers, and decluttering can free up tons of counter space.",
      ),
      createMessage("user", "What about lighting? It feels dark in there"),
      createMessage(
        "agent",
        "Under-cabinet LED strips are affordable and make a dramatic difference in both function and ambiance.",
      ),
      createMessage("user", "These are all things I can do myself without breaking the bank"),
      createMessage("user", "I'm excited to start with the cabinet organization this weekend!"),
    ],
    expected: 1,
    description: "Kitchen improvement on budget with actionable plan",
    category: "Home Improvement",
  },

  // === INCOMPLETE CONVERSATION SCENARIOS ===

  // Technical Support - Incomplete #3
  {
    name: "Tech Support Incomplete 3",
    messages: [
      createMessage("user", "My computer is making weird noises"),
      createMessage(
        "agent",
        "That could indicate a hardware issue. What kind of noises are you hearing?",
      ),
      createMessage("user", "It's like a clicking sound, especially when I start it up"),
      createMessage(
        "agent",
        "Clicking sounds often point to hard drive issues. Is your computer running slower than usual?",
      ),
      createMessage("user", "Yes, it takes forever to boot up and programs are sluggish"),
      createMessage(
        "agent",
        "This sounds like your hard drive may be failing. How old is your computer?",
      ),
      createMessage("user", "About 5 years old. Should I be worried about losing my data?"),
      createMessage(
        "agent",
        "Yes, you should back up your important files immediately. Do you have an external drive?",
      ),
      createMessage("user", "I have one somewhere. But I'm also wondering about"),
    ],
    expected: 0,
    description: "Hardware diagnosis with incomplete follow-up concern",
    category: "Technical Support",
  },

  // Project Planning - Incomplete #3
  {
    name: "Project Planning Incomplete 3",
    messages: [
      createMessage("user", "We need to launch our new mobile app by year-end"),
      createMessage(
        "agent",
        "That's an exciting goal! What stage is the development currently in?",
      ),
      createMessage(
        "user",
        "We're about 60% done with core features, but we haven't started testing yet",
      ),
      createMessage(
        "agent",
        "Testing is crucial for a successful launch. What's your team size for this project?",
      ),
      createMessage("user", "Three developers, one designer, and me as project manager"),
      createMessage("agent", "Good team size. Have you planned for beta testing with real users?"),
      createMessage("user", "Not yet, but that's a great point. We should probably"),
      createMessage(
        "agent",
        "Beta testing can reveal issues you might not catch internally. How long until your deadline?",
      ),
      createMessage("user", "About 4 months. I think we need to prioritize"),
      createMessage("user", "Actually, let me think about whether we should"),
    ],
    expected: 0,
    description: "App launch planning with incomplete prioritization thought",
    category: "Project Planning",
  },

  // Customer Service - Incomplete #3
  {
    name: "Customer Service Incomplete 3",
    messages: [
      createMessage("user", "I've been charged twice for the same subscription"),
      createMessage(
        "agent",
        "I'm sorry about the duplicate charge! Let me help you resolve this. Which subscription is it for?",
      ),
      createMessage("user", "My premium account that I upgraded last month"),
      createMessage(
        "agent",
        "I can see the duplicate charges here. One charge is correct, and I'll refund the duplicate immediately.",
      ),
      createMessage("user", "How long will the refund take to appear?"),
      createMessage(
        "agent",
        "Typically 3-5 business days. You'll receive an email confirmation shortly.",
      ),
      createMessage("user", "Great! While we're talking, I also wanted to ask about"),
      createMessage("agent", "Of course! What else can I help you with?"),
      createMessage("user", "I've been thinking about downgrading my plan, but"),
      createMessage("user", "Actually, maybe I should first understand"),
    ],
    expected: 0,
    description: "Billing issue resolved but incomplete plan change inquiry",
    category: "Customer Service",
  },

  // Educational - Incomplete #3
  {
    name: "Educational Incomplete 3",
    messages: [
      createMessage("user", "I'm confused about the difference between mitosis and meiosis"),
      createMessage(
        "agent",
        "Great question! Both are cell division processes but serve different purposes. What specifically confuses you?",
      ),
      createMessage(
        "user",
        "I understand mitosis makes identical cells, but meiosis is more complicated",
      ),
      createMessage(
        "agent",
        "Right! Meiosis creates gametes (sex cells) with half the chromosomes. It involves two divisions instead of one.",
      ),
      createMessage("user", "Why does it need two divisions?"),
      createMessage(
        "agent",
        "The first division separates homologous pairs, the second separates sister chromatids - like mitosis.",
      ),
      createMessage("user", "So meiosis reduces chromosome number from diploid to haploid?"),
      createMessage(
        "agent",
        "Exactly! That's why when sperm and egg combine, you get back to diploid.",
      ),
      createMessage("user", "That makes sense! But I'm still not clear about"),
      createMessage("user", "Wait, let me think about this crossing over thing"),
    ],
    expected: 0,
    description: "Biology lesson with incomplete crossing over question",
    category: "Educational",
  },

  // Creative Writing - Incomplete #3
  {
    name: "Creative Writing Incomplete 3",
    messages: [
      createMessage("user", "I'm writing a fantasy novel and struggling with world-building"),
      createMessage(
        "agent",
        "World-building is one of the most exciting parts of fantasy! What aspect is challenging you?",
      ),
      createMessage("user", "I can't decide how magic should work in my world"),
      createMessage(
        "agent",
        "Magic systems are crucial! Do you want magic to have costs/limitations or be more free-form?",
      ),
      createMessage(
        "user",
        "I think limitations make it more interesting, but I'm not sure what kind",
      ),
      createMessage(
        "agent",
        "Great instinct! Popular limitations include physical exhaustion, rare components, or emotional states.",
      ),
      createMessage("user", "Emotional states sounds intriguing. Like magic tied to feelings?"),
      createMessage(
        "agent",
        "Exactly! Anger for fire magic, sadness for water, joy for light - creates character development opportunities.",
      ),
      createMessage("user", "That's brilliant! But then I wonder about"),
      createMessage("user", "Hmm, if emotions control magic, then what happens when"),
    ],
    expected: 0,
    description: "Fantasy world-building with incomplete emotion-magic question",
    category: "Creative Writing",
  },

  // Recipe Development - Incomplete #3
  {
    name: "Recipe Development Incomplete 3",
    messages: [
      createMessage("user", "I want to make homemade bread but I've never done it before"),
      createMessage(
        "agent",
        "Bread making is so rewarding! Are you thinking of a simple white bread or something more complex?",
      ),
      createMessage("user", "Maybe start simple. What ingredients do I need?"),
      createMessage(
        "agent",
        "For basic bread: flour, water, yeast, salt, and a little sugar. Very simple ingredient list!",
      ),
      createMessage("user", "Do I need a special mixer or can I do it by hand?"),
      createMessage(
        "agent",
        "You can absolutely do it by hand! It's actually quite therapeutic and gives you better feel for the dough.",
      ),
      createMessage("user", "How long does the whole process take?"),
      createMessage(
        "agent",
        "About 4-5 hours total, but most of that is rising time where you're not actively working.",
      ),
      createMessage("user", "That's not too bad. But I'm wondering about"),
      createMessage("user", "Actually, should I be concerned about"),
    ],
    expected: 0,
    description: "Bread making guidance with incomplete concern",
    category: "Recipe Development",
  },

  // Travel Planning - Incomplete #3
  {
    name: "Travel Planning Incomplete 3",
    messages: [
      createMessage("user", "I'm planning my first solo international trip"),
      createMessage(
        "agent",
        "How exciting! Solo travel can be incredibly rewarding. Where are you thinking of going?",
      ),
      createMessage("user", "Somewhere in Europe, maybe Italy or France"),
      createMessage(
        "agent",
        "Both excellent choices for first-time solo travelers! What draws you to those countries?",
      ),
      createMessage("user", "I love art and history, plus the food looks amazing"),
      createMessage(
        "agent",
        "Perfect match! Italy might edge out France for art and history - Rome, Florence, Venice are incredible.",
      ),
      createMessage("user", "How long should I plan for? I have two weeks vacation"),
      createMessage(
        "agent",
        "Two weeks is perfect for Italy! You could do 3-4 cities without rushing.",
      ),
      createMessage("user", "What about safety? I'm a bit nervous about traveling alone"),
      createMessage("user", "Also, I should probably think about"),
    ],
    expected: 0,
    description: "Solo travel planning with incomplete safety concern",
    category: "Travel Planning",
  },

  // Career Advice - Incomplete #3
  {
    name: "Career Advice Incomplete 3",
    messages: [
      createMessage("user", "I think I'm ready to ask for a promotion"),
      createMessage("agent", "That's exciting! What makes you feel ready for the next level?"),
      createMessage(
        "user",
        "I've been in my current role for 3 years and consistently exceed my goals",
      ),
      createMessage(
        "agent",
        "Strong track record is important! Have you taken on any additional responsibilities recently?",
      ),
      createMessage(
        "user",
        "Yes, I've been mentoring new hires and leading some cross-team projects",
      ),
      createMessage(
        "agent",
        "Perfect examples of promotion-worthy contributions! Have you discussed career growth with your manager?",
      ),
      createMessage("user", "Not directly, but they've given positive feedback on my leadership"),
      createMessage(
        "agent",
        "That's encouraging! When you approach them, be specific about your achievements and future goals.",
      ),
      createMessage("user", "Should I prepare a formal presentation or just have a conversation?"),
      createMessage("user", "Actually, I'm also wondering if I should"),
    ],
    expected: 0,
    description: "Promotion preparation with incomplete strategy question",
    category: "Career Advice",
  },

  // Home Improvement - Incomplete #3
  {
    name: "Home Improvement Incomplete 3",
    messages: [
      createMessage(
        "user",
        "I want to create a home office space but I only have a corner of my bedroom",
      ),
      createMessage(
        "agent",
        "Small spaces can work great for home offices! What kind of work do you do?",
      ),
      createMessage("user", "Mostly computer work - writing and video calls"),
      createMessage(
        "agent",
        "Perfect! You'll need good lighting and a quiet setup for calls. How much space do you have?",
      ),
      createMessage("user", "Maybe 6 feet by 4 feet in the corner"),
      createMessage(
        "agent",
        "That's plenty! A corner desk, good chair, and wall-mounted shelves could maximize the space.",
      ),
      createMessage(
        "user",
        "What about separating it from the bedroom? I want some visual boundary",
      ),
      createMessage(
        "agent",
        "Great thinking! A room divider screen or tall bookshelf can create that separation.",
      ),
      createMessage("user", "I like the bookshelf idea. But I'm also concerned about"),
      createMessage("user", "Wait, should I think about the noise factor when"),
    ],
    expected: 0,
    description: "Home office setup with incomplete noise consideration",
    category: "Home Improvement",
  },

  // === ADDITIONAL SCENARIOS FOR STATISTICAL SIGNIFICANCE ===

  // More Technical Support scenarios...
  {
    name: "Tech Support Complete 3",
    messages: [
      createMessage("user", "My printer won't connect to my new WiFi network"),
      createMessage(
        "agent",
        "Let's get that printer connected! Is this a wireless printer that was previously working?",
      ),
      createMessage("user", "Yes, it worked fine until I changed my internet provider"),
      createMessage(
        "agent",
        "New router means new network settings. Do you have the printer's manual handy?",
      ),
      createMessage("user", "I can find it. What am I looking for?"),
      createMessage(
        "agent",
        "We need to access the printer's network settings menu. Usually through the display panel.",
      ),
      createMessage("user", "Found it! I see a WiFi setup option"),
      createMessage("agent", "Perfect! Select your new network name and enter the WiFi password."),
      createMessage("user", "Done! It's connecting now"),
      createMessage("user", "Excellent! It's working and I can print again."),
    ],
    expected: 1,
    description: "Printer WiFi setup successfully completed",
    category: "Technical Support",
  },

  // More Project Planning scenarios...
  {
    name: "Project Planning Complete 3",
    messages: [
      createMessage("user", "Our team needs to implement a new CRM system"),
      createMessage(
        "agent",
        "CRM implementations are significant projects! What's driving this change?",
      ),
      createMessage("user", "Our current system is outdated and we're losing track of leads"),
      createMessage("agent", "Makes sense. How many users will need access to the new system?"),
      createMessage("user", "About 20 people across sales and customer service"),
      createMessage(
        "agent",
        "Good size for most CRM platforms. Have you evaluated any specific options yet?",
      ),
      createMessage("user", "We're looking at Salesforce and HubSpot mainly"),
      createMessage("agent", "Both solid choices. What's your timeline for implementation?"),
      createMessage("user", "We'd like to be up and running by start of next quarter"),
      createMessage("user", "I think we have enough to start the formal evaluation process."),
    ],
    expected: 1,
    description: "CRM implementation planning with clear next steps",
    category: "Project Planning",
  },

  // === ADDITIONAL SCENARIOS FOR STATISTICAL SIGNIFICANCE ===

  // More Customer Service scenarios...
  {
    name: "Customer Service Complete 3",
    messages: [
      createMessage("user", "I need to update my billing address"),
      createMessage("agent", "I can help you with that! Can you verify your account first?"),
      createMessage("user", "Sure, my email is john.doe@email.com"),
      createMessage("agent", "Perfect, I found your account. What's your new address?"),
      createMessage("user", "123 Oak Street, Portland, OR 97201"),
      createMessage(
        "agent",
        "Got it. I've updated your billing address to 123 Oak Street, Portland, OR 97201.",
      ),
      createMessage("user", "Will this take effect immediately?"),
      createMessage("agent", "Yes, it's active now and will be used for your next billing cycle."),
      createMessage("user", "Perfect, thanks for the quick help!"),
      createMessage("user", "That's exactly what I needed."),
    ],
    expected: 1,
    description: "Simple billing address update completed successfully",
    category: "Customer Service",
  },

  {
    name: "Customer Service Incomplete 4",
    messages: [
      createMessage("user", "I want to cancel my subscription"),
      createMessage(
        "agent",
        "I'm sorry to hear you want to cancel. May I ask what's prompting this decision?",
      ),
      createMessage("user", "I'm not using the service as much as I thought I would"),
      createMessage(
        "agent",
        "I understand. Would you be interested in downgrading to a lower plan instead?",
      ),
      createMessage("user", "Maybe, what options do you have?"),
      createMessage(
        "agent",
        "We have a basic plan at $9.99/month with core features, or a lite plan at $4.99/month.",
      ),
      createMessage("user", "The lite plan sounds interesting, but I'm wondering about"),
      createMessage("agent", "What would you like to know about the lite plan?"),
      createMessage("user", "Well, I need to understand if it includes"),
      createMessage("user", "Actually, let me also ask about"),
    ],
    expected: 0,
    description: "Subscription cancellation with incomplete feature inquiry",
    category: "Customer Service",
  },

  // More Technical Support scenarios...
  {
    name: "Tech Support Complete 4",
    messages: [
      createMessage("user", "My email isn't syncing on my phone"),
      createMessage(
        "agent",
        "Let's get that fixed! Are you using the default mail app or a third-party client?",
      ),
      createMessage("user", "The default iPhone mail app"),
      createMessage(
        "agent",
        "What type of email account is it - Gmail, Outlook, or something else?",
      ),
      createMessage("user", "It's a Gmail account"),
      createMessage(
        "agent",
        "Try going to Settings > Mail > Accounts > Gmail and toggle the Mail switch off and on.",
      ),
      createMessage("user", "Okay, I did that"),
      createMessage(
        "agent",
        "Now check if new emails are coming through. Sometimes it takes a minute.",
      ),
      createMessage("user", "Yes! I just got three new emails"),
      createMessage("user", "Thank you, that fixed it completely!"),
    ],
    expected: 1,
    description: "Email sync issue resolved with simple toggle fix",
    category: "Technical Support",
  },

  {
    name: "Tech Support Incomplete 5",
    messages: [
      createMessage("user", "My video calls keep dropping"),
      createMessage("agent", "That's frustrating! What platform are you using for video calls?"),
      createMessage("user", "Mostly Zoom, but it happens on Teams too"),
      createMessage(
        "agent",
        "Since it's happening on multiple platforms, it's likely a network issue. How's your internet speed?",
      ),
      createMessage("user", "I'm supposed to have 100 Mbps but I haven't tested it recently"),
      createMessage("agent", "Let's check that. Can you go to speedtest.net and run a test?"),
      createMessage("user", "It shows 25 Mbps download and 5 Mbps upload"),
      createMessage(
        "agent",
        "That's significantly lower than expected. Are you connected via WiFi or ethernet?",
      ),
      createMessage("user", "WiFi, but I'm sitting right next to the router"),
      createMessage("user", "Could this also be related to the fact that"),
    ],
    expected: 0,
    description: "Video call dropping with incomplete additional factor mention",
    category: "Technical Support",
  },

  // More Educational scenarios...
  {
    name: "Educational Complete 3",
    messages: [
      createMessage("user", "Can you explain the water cycle?"),
      createMessage(
        "agent",
        "Absolutely! The water cycle is how water moves through Earth's environment. Where should we start?",
      ),
      createMessage("user", "How does water get into the air?"),
      createMessage(
        "agent",
        "Great starting point! Water evaporates from oceans, lakes, and rivers when heated by the sun.",
      ),
      createMessage("user", "Then what happens to that water vapor?"),
      createMessage(
        "agent",
        "It rises into the atmosphere and cools down, forming tiny water droplets around dust particles.",
      ),
      createMessage("user", "Is that how clouds form?"),
      createMessage(
        "agent",
        "Exactly! Those droplets cluster together to form clouds through condensation.",
      ),
      createMessage("user", "And then it rains when the clouds get too heavy?"),
      createMessage("user", "This makes perfect sense now, thank you!"),
    ],
    expected: 1,
    description: "Water cycle explanation with satisfied understanding",
    category: "Educational",
  },

  {
    name: "Educational Incomplete 4",
    messages: [
      createMessage("user", "I'm struggling with fractions in math"),
      createMessage("agent", "Fractions can be tricky! What specific part is giving you trouble?"),
      createMessage("user", "Adding fractions with different denominators"),
      createMessage(
        "agent",
        "Ah, that's a common challenge. You need to find a common denominator first.",
      ),
      createMessage("user", "How do I do that?"),
      createMessage(
        "agent",
        "Find the least common multiple of the denominators. For example, with 1/3 + 1/4, the LCM of 3 and 4 is 12.",
      ),
      createMessage("user", "So I convert both fractions to have 12 as the denominator?"),
      createMessage(
        "agent",
        "Exactly! 1/3 becomes 4/12 and 1/4 becomes 3/12, so the answer is 7/12.",
      ),
      createMessage("user", "That makes sense! But what about when"),
      createMessage("user", "Actually, I'm also confused about"),
    ],
    expected: 0,
    description: "Fractions lesson with incomplete follow-up questions",
    category: "Educational",
  },

  // More Creative Writing scenarios...
  {
    name: "Creative Writing Complete 3",
    messages: [
      createMessage("user", "I need help with dialogue in my story"),
      createMessage(
        "agent",
        "Dialogue is so important for bringing characters to life! What's the challenge?",
      ),
      createMessage("user", "My characters all sound the same when they talk"),
      createMessage(
        "agent",
        "That's a common issue. Each character should have a unique voice based on their background and personality.",
      ),
      createMessage("user", "How do I make them sound different?"),
      createMessage(
        "agent",
        "Consider their education level, age, region, and personality. A teenager talks differently than a professor.",
      ),
      createMessage("user", "So I should give them different vocabulary and speech patterns?"),
      createMessage(
        "agent",
        "Exactly! Also consider their emotional state and relationships with other characters.",
      ),
      createMessage("user", "This gives me a clear framework to work with"),
      createMessage("user", "I'm excited to revise my dialogue now!"),
    ],
    expected: 1,
    description: "Dialogue writing advice with enthusiastic acceptance",
    category: "Creative Writing",
  },

  {
    name: "Creative Writing Incomplete 5",
    messages: [
      createMessage("user", "I'm having trouble with my story's pacing"),
      createMessage(
        "agent",
        "Pacing is crucial for keeping readers engaged! What's happening with yours?",
      ),
      createMessage("user", "Some parts feel too slow and others feel rushed"),
      createMessage(
        "agent",
        "That's actually quite normal in first drafts. Are you alternating between action and reflection?",
      ),
      createMessage("user", "I think I have too much description and not enough action"),
      createMessage(
        "agent",
        "Try reading your work aloud - it helps identify pacing issues. Where does it drag?",
      ),
      createMessage("user", "Definitely in the middle section where I describe the setting"),
      createMessage(
        "agent",
        "You can weave setting details into action scenes instead of dedicating whole paragraphs to description.",
      ),
      createMessage("user", "That's a great technique! But I'm also wondering about"),
      createMessage("user", "Should I be concerned about"),
    ],
    expected: 0,
    description: "Story pacing advice with incomplete additional concern",
    category: "Creative Writing",
  },

  // More Recipe Development scenarios...
  {
    name: "Recipe Development Complete 3",
    messages: [
      createMessage("user", "I want to make homemade pizza dough"),
      createMessage(
        "agent",
        "Homemade pizza is so rewarding! Are you looking for a quick recipe or traditional slow-rise?",
      ),
      createMessage("user", "I have time, so I'd prefer the traditional method"),
      createMessage(
        "agent",
        "Perfect! You'll need bread flour, water, yeast, salt, and a touch of olive oil.",
      ),
      createMessage("user", "What's the ratio of ingredients?"),
      createMessage(
        "agent",
        "For two pizzas: 500g bread flour, 325ml warm water, 7g active dry yeast, 10g salt, 2 tbsp olive oil.",
      ),
      createMessage("user", "How long should I let it rise?"),
      createMessage(
        "agent",
        "First rise is 1-2 hours until doubled, then shape and let rest 30 minutes before stretching.",
      ),
      createMessage("user", "This sounds perfect for weekend pizza night"),
      createMessage("user", "I can't wait to try this recipe!"),
    ],
    expected: 1,
    description: "Pizza dough recipe with excited anticipation",
    category: "Recipe Development",
  },

  {
    name: "Recipe Development Incomplete 4",
    messages: [
      createMessage("user", "I need a good marinade for chicken"),
      createMessage(
        "agent",
        "Great choice! What cooking method are you planning - grilling, baking, or pan-searing?",
      ),
      createMessage("user", "I'll be grilling it"),
      createMessage(
        "agent",
        "For grilling, you want something with acid to tenderize and oil to prevent sticking. Any flavor preferences?",
      ),
      createMessage("user", "Maybe something Mediterranean-inspired"),
      createMessage(
        "agent",
        "Perfect! Try olive oil, lemon juice, garlic, oregano, and a touch of red wine vinegar.",
      ),
      createMessage("user", "How long should I marinate it?"),
      createMessage(
        "agent",
        "For chicken, 2-4 hours is ideal. Longer can make the texture mushy from the acid.",
      ),
      createMessage("user", "That timing works perfectly. But I'm also thinking about"),
      createMessage("user", "Would it be better if I"),
    ],
    expected: 0,
    description: "Chicken marinade recipe with incomplete modification thought",
    category: "Recipe Development",
  },

  // More Travel Planning scenarios...
  {
    name: "Travel Planning Complete 3",
    messages: [
      createMessage("user", "I'm planning a trip to Japan for the first time"),
      createMessage(
        "agent",
        "How exciting! Japan is amazing. What time of year are you thinking of visiting?",
      ),
      createMessage("user", "Late March or early April for cherry blossom season"),
      createMessage(
        "agent",
        "Perfect timing! That's peak cherry blossom season. How long will you be there?",
      ),
      createMessage("user", "About 10 days"),
      createMessage(
        "agent",
        "Great duration. I'd suggest Tokyo (4 days), Kyoto (3 days), and maybe Osaka (2 days) with a day trip.",
      ),
      createMessage("user", "Should I get a JR Pass?"),
      createMessage(
        "agent",
        "Absolutely! For that itinerary, a 7-day JR Pass will save you money and time.",
      ),
      createMessage("user", "This gives me a perfect framework to start detailed planning"),
      createMessage("user", "I'm so excited for this adventure!"),
    ],
    expected: 1,
    description: "Japan trip planning with enthusiastic conclusion",
    category: "Travel Planning",
  },

  {
    name: "Travel Planning Incomplete 4",
    messages: [
      createMessage("user", "I want to plan a European backpacking trip"),
      createMessage("agent", "That sounds incredible! How long do you have for this adventure?"),
      createMessage("user", "About 6 weeks in the summer"),
      createMessage(
        "agent",
        "Perfect amount of time! Are you interested in Western Europe, Eastern Europe, or a mix?",
      ),
      createMessage(
        "user",
        "I'd like to see a mix - both classic destinations and some off-the-beaten-path places",
      ),
      createMessage(
        "agent",
        "Great approach! You could start in Western Europe and work your way east for budget efficiency.",
      ),
      createMessage("user", "What's a realistic number of countries to visit?"),
      createMessage(
        "agent",
        "With 6 weeks, 8-10 countries would give you meaningful time in each place without rushing.",
      ),
      createMessage("user", "That sounds reasonable. I'm also wondering about"),
      createMessage("user", "Should I be concerned about"),
    ],
    expected: 0,
    description: "European backpacking with incomplete logistics question",
    category: "Travel Planning",
  },

  // More Career Advice scenarios...
  {
    name: "Career Advice Complete 3",
    messages: [
      createMessage("user", "I want to negotiate my salary but I'm nervous"),
      createMessage(
        "agent",
        "Salary negotiations can feel intimidating, but preparation helps! What's your situation?",
      ),
      createMessage("user", "I've been at my company for 2 years and haven't had a raise"),
      createMessage(
        "agent",
        "That's definitely grounds for a conversation. Have you researched market rates for your role?",
      ),
      createMessage("user", "Yes, I'm about 15% below market average"),
      createMessage(
        "agent",
        "That's solid data to support your case. Have you documented your achievements and added responsibilities?",
      ),
      createMessage("user", "I have a list of projects I've led and the results they delivered"),
      createMessage(
        "agent",
        "Perfect! Present the market data, your contributions, and propose a specific number.",
      ),
      createMessage("user", "This gives me the confidence to schedule that meeting"),
      createMessage("user", "Thank you for the clear strategy!"),
    ],
    expected: 1,
    description: "Salary negotiation advice with confident conclusion",
    category: "Career Advice",
  },

  {
    name: "Career Advice Incomplete 4",
    messages: [
      createMessage("user", "I'm thinking about going back to school for an MBA"),
      createMessage(
        "agent",
        "That's a significant decision! What's motivating you to consider an MBA?",
      ),
      createMessage(
        "user",
        "I want to move into senior management and feel like I need the business foundation",
      ),
      createMessage(
        "agent",
        "That's a good reason. Have you considered full-time vs part-time vs executive programs?",
      ),
      createMessage("user", "I'm leaning toward part-time so I can keep working"),
      createMessage(
        "agent",
        "Smart approach for maintaining income and applying learnings immediately. What's your timeline?",
      ),
      createMessage("user", "I'd like to start next fall, so I need to take the GMAT soon"),
      createMessage(
        "agent",
        "That gives you good lead time for applications. Have you identified target schools?",
      ),
      createMessage("user", "I have a few in mind, but I'm also wondering about"),
      createMessage("user", "The ROI calculation is something I need to"),
    ],
    expected: 0,
    description: "MBA consideration with incomplete ROI analysis thought",
    category: "Career Advice",
  },

  // More Home Improvement scenarios...
  {
    name: "Home Improvement Complete 3",
    messages: [
      createMessage("user", "I want to paint my living room but I'm overwhelmed by color choices"),
      createMessage(
        "agent",
        "Color selection can be daunting! What's the current color and what feeling are you going for?",
      ),
      createMessage("user", "It's currently beige and I want something more modern and cozy"),
      createMessage(
        "agent",
        "Great direction! What's the lighting like in the room - lots of natural light or more artificial?",
      ),
      createMessage("user", "Good natural light from large windows facing south"),
      createMessage(
        "agent",
        "Perfect! With good light, you can handle deeper colors. Consider warm grays, sage green, or navy blue.",
      ),
      createMessage("user", "I love the sage green idea - it sounds calming"),
      createMessage(
        "agent",
        "Sage green is beautiful and very trendy right now. Get sample sizes and paint large swatches to see how it looks throughout the day.",
      ),
      createMessage("user", "That's exactly the guidance I needed"),
      createMessage("user", "I'm excited to start this project!"),
    ],
    expected: 1,
    description: "Paint color selection with enthusiastic decision",
    category: "Home Improvement",
  },

  {
    name: "Home Improvement Incomplete 5",
    messages: [
      createMessage("user", "My deck needs staining but I've never done it before"),
      createMessage(
        "agent",
        "Deck staining is a great DIY project! What type of wood is your deck made of?",
      ),
      createMessage("user", "I think it's pressure-treated pine, about 5 years old"),
      createMessage(
        "agent",
        "Perfect age for staining. Has it ever been stained or sealed before?",
      ),
      createMessage("user", "I don't think so - it's just the natural weathered gray color"),
      createMessage(
        "agent",
        "You'll need to clean and possibly sand it first. What's the weather forecast looking like?",
      ),
      createMessage("user", "Good for the next few days - sunny and dry"),
      createMessage(
        "agent",
        "Ideal conditions! You'll want 48 hours of dry weather after application.",
      ),
      createMessage("user", "What type of stain should I use? And also"),
      createMessage("user", "I'm wondering if I should"),
    ],
    expected: 0,
    description: "Deck staining guidance with incomplete product/technique question",
    category: "Home Improvement",
  },

  // === SPECIALIZED CONVERSATION TYPES ===

  // Medical/Health conversations
  {
    name: "Health Discussion Complete",
    messages: [
      createMessage("user", "I've been having trouble sleeping lately"),
      createMessage(
        "agent",
        "Sleep issues can really affect your day. How long has this been going on?",
      ),
      createMessage("user", "About two weeks now - I fall asleep fine but wake up around 3 AM"),
      createMessage(
        "agent",
        "That's frustrating. Any major changes in your routine, stress levels, or diet recently?",
      ),
      createMessage("user", "I started a new job last month, so definitely more stress"),
      createMessage(
        "agent",
        "Job transitions can definitely disrupt sleep. Are you doing anything to wind down before bed?",
      ),
      createMessage("user", "Not really - I usually work until right before bed"),
      createMessage(
        "agent",
        "Try creating a buffer zone - stop work an hour before bed and do something relaxing.",
      ),
      createMessage("user", "That makes sense. I'll try reading or light stretching"),
      createMessage("user", "Thanks for the practical advice!"),
    ],
    expected: 1,
    description: "Sleep advice discussion with helpful conclusion",
    category: "Health Discussion",
  },

  // Financial Planning conversations
  {
    name: "Financial Planning Complete",
    messages: [
      createMessage("user", "I want to start investing but don't know where to begin"),
      createMessage(
        "agent",
        "Great decision to start investing! What are your main financial goals?",
      ),
      createMessage(
        "user",
        "Long-term retirement savings and maybe a house down payment in 5-7 years",
      ),
      createMessage("agent", "Good mix of timeframes. Do you have an emergency fund established?"),
      createMessage("user", "Yes, I have 6 months of expenses saved"),
      createMessage(
        "agent",
        "Excellent foundation! For retirement, consider index funds in a 401k or IRA. For the house, maybe a mix of conservative investments.",
      ),
      createMessage("user", "Should I prioritize the 401k match first?"),
      createMessage(
        "agent",
        "Absolutely! That's free money. Max out any employer match before other investments.",
      ),
      createMessage("user", "This gives me a clear starting strategy"),
      createMessage("user", "I feel much more confident about beginning!"),
    ],
    expected: 1,
    description: "Investment guidance with confident next steps",
    category: "Financial Planning",
  },

  // Hobby/Craft conversations
  {
    name: "Hobby Discussion Complete",
    messages: [
      createMessage("user", "I want to learn to play guitar as an adult beginner"),
      createMessage(
        "agent",
        "Guitar is such a rewarding instrument! What style of music interests you most?",
      ),
      createMessage(
        "user",
        "I love folk and acoustic rock - artists like Bob Dylan and Neil Young",
      ),
      createMessage(
        "agent",
        "Perfect choice for starting with acoustic guitar! Have you considered lessons vs self-teaching?",
      ),
      createMessage(
        "user",
        "I'm thinking of starting with online lessons to see if I stick with it",
      ),
      createMessage(
        "agent",
        "Smart approach! YouTube has great free content, or apps like Yousician for structured learning.",
      ),
      createMessage("user", "What about getting a guitar - any recommendations for beginners?"),
      createMessage(
        "agent",
        "For folk/acoustic rock, a steel-string acoustic around $200-300 from Yamaha or Fender is perfect.",
      ),
      createMessage("user", "This gives me everything I need to get started"),
      createMessage("user", "I'm excited to begin this musical journey!"),
    ],
    expected: 1,
    description: "Guitar learning advice with enthusiastic commitment",
    category: "Hobby Discussion",
  },
];
