/** Default source code seeded when a room document is empty. */
module.exports = {
  room_alpha01: `# Algorithm Lab — collaborative scratchpad
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return seen[target - n], i
        seen[n] = i
    return None

print(two_sum([2, 7, 11, 15], 9))
`,
  room_beta02: `// React Sandbox — shared component sketch
import { useState, useEffect } from "react";

export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    console.log("count changed:", count);
  }, [count]);
  return { count, inc: () => setCount((c) => c + 1) };
}
`,
  room_gamma03: `// Systems Design — API contract draft
interface Workspace {
  id: string;
  name: string;
  language: string;
  members: string[];
}

async function listWorkspaces(): Promise<Workspace[]> {
  const res = await fetch("/api/rooms");
  const { rooms } = await res.json();
  return rooms;
}
`,
  room_delta04: `// Rust Workshop
fn main() {
    let nums = vec![1, 2, 3, 4, 5];
    let sum: i32 = nums.iter().sum();
    println!("sum = {}", sum);
}
`,
  room_epsilon05: `// Data Pipelines — Go worker sketch
package main

import "fmt"

func main() {
    ch := make(chan int, 2)
    ch <- 1
    ch <- 2
    close(ch)
    for v := range ch {
        fmt.Println(v)
    }
}
`,
};
