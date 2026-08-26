// Google reviews shown in the homepage marquee.
//
// First names only — deliberately semi-anonymous, as agreed. Owner replies are
// not shown, and only five-star reviews with actual text are listed (name-only
// ratings have nothing to display). Long reviews are trimmed to the part that
// reads well at a glance; nothing is reworded or invented.
//
// To add one: append to the array. The marquee loops whatever is here.

export interface Review {
  /** First name only. */
  name: string
  quote: string
}

export const REVIEWS: Review[] = [
  {
    name: 'Madison',
    quote:
      'Such a great time! Definitely recommend for a fun afternoon. We rented all three for an hour with four people and had plenty of time!',
  },
  {
    name: 'Caleb',
    quote:
      "We did a 2 hour racing slot and this was by far the most exciting fun I've had in a while. The simulators here are not your average simulator.",
  },
  {
    name: 'Jason',
    quote:
      'A must for anyone, especially if you are into any type of racing. Enjoyed it with my family, kids had just as much fun as I did. Very realistic, very fun.',
  },
  {
    name: 'Darcy',
    quote:
      'Reserved for a company party and we all loved it! Mark was awesome to work with before, during and after. Highly recommended!',
  },
  {
    name: 'Joe',
    quote:
      'Had a large group and had a really great time. The racing experience was top notch and the addition of RC cars and the rock course was awesome.',
  },
  {
    name: 'Jeff',
    quote:
      'The hardware here is fantastic — high resolution, tons of torque, the sound is intense, and the options for cars and tracks are seemingly endless.',
  },
  {
    name: 'Adam',
    quote:
      'My two friends and I booked MC Racing out for a couple of hours and had a blast driving the immersive simulators on many tracks and car classes.',
  },
  {
    name: 'Alan',
    quote:
      'Awesome experience! The owner Mark made it really fun, especially for our first-time group of varying age and skill.',
  },
  {
    name: 'Judy',
    quote:
      'What an experience! Really feels like you are driving a race car. Mark the owner is a super kind guy. Can’t recommend this enough!',
  },
  {
    name: 'Crystal',
    quote:
      "Sooooo fun! We came here for my son's 15th birthday and it was incredible. Every race was just too much fun — an hour was definitely not enough.",
  },
  {
    name: 'Ros',
    quote:
      "The owners are awesome and super helpful if you have never raced before. The set ups are great quality and you get your money's worth!",
  },
  {
    name: 'Andrew',
    quote:
      'Such a fun atmosphere! Me and my buddies had a blast with the RC cars racing against each other, and with the racing simulators.',
  },
  {
    name: 'Amanda',
    quote:
      'We had an absolute blast! Mark was super accommodating and made the whole experience really fun. We are ages 45 down to 8 and we all thoroughly enjoyed it.',
  },
  {
    name: 'Tex',
    quote:
      'Came here with my 11 year old son and we had a blast. Mark is a really cool dude and made our experience one of the best you could ask for.',
  },
  {
    name: 'Jordan',
    quote:
      'As good as advertised! Top of the line equipment and experience. We drove 1.5 hours and it was worth it and so much more.',
  },
  {
    name: 'Jacob',
    quote:
      'Mark was a great host for an even greater place. Every fine detail and feature makes you fully feel in the cockpit of the car.',
  },
  {
    name: 'JR',
    quote:
      'Worth the visit! The sim rigs have every correct gadget you need to get the full simulation experience.',
  },
  {
    name: 'Donald',
    quote:
      'Mark runs a small operation — which only means you get a more personalized experience.',
  },
  {
    name: 'Benjamin',
    quote:
      'Awesome racing sim place with a gearhead club atmosphere, where racing fans can congregate and watch races between simulator sessions.',
  },
]
