import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let state: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 0,
  };

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", async (req, res) => {
    let { k, x, messageType } = req.body;
    if (!isFaulty && !state.killed) {
      if (messageType == "propose") {
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x); // Use '!' to assert non-null after the check
        let proposal = proposals.get(k)!;

        if (proposal.length >= (N - F)) {
          let count0 = proposal.filter((el) => el == 0).length;
          let count1 = proposal.filter((el) => el == 1).length;
          if (count0 > (N / 2)) {
            x = 0;
          } else if (count1 > (N / 2)) {
            x = 1;
          } else {
            x = "?";
          }
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, messageType: "vote" }),
            });
          }
        }
      }
      else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x)
        let vote = votes.get(k)!;
        if (vote.length >= (N - F)) {
          console.log("vote", vote,"node :",nodeId,"k :",k)
          let count0 = vote.filter((el) => el == 0).length;
          let count1 = vote.filter((el) => el == 1).length;

          if (count0 >= F + 1) {
            state.x = 0;
            state.decided = true;
          } else if (count1 >= F + 1) {
            state.x = 1;
            state.decided = true;
          } else {
            if (count0 + count1 > 0 && count0 > count1) {
              state.x = 0;
            } else if (count0 + count1 > 0 && count0 < count1) {
              state.x = 1;
            } else {
              state.x = Math.random() > 0.5 ? 0 : 1;
            }
            state.k = k + 1;

            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({k: state.k, x: state.x, messageType: "propose"}),
              });
            }
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(5);
    }
    if (!isFaulty) {
      state.k = 1;
      state.x = initialValue;
      state.decided = false;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ k: state.k, x: state.x, messageType: "propose" }),
        });
      }
    }
    else {
      state.decided = null;
      state.x = null;
      state.k = null;
    }
    res.status(200).send("Consensus algorithm started.");
  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    state.killed = true;
    res.status(200).send("killed");
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    res.status(200).send({
      killed: state.killed,
      x: state.x,
      decided: state.decided,
      k: state.k,
    });
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
