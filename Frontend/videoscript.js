// const baseurl = "http://localhost:8080";
const baseurl = "https://webrtc-sample-53ey.onrender.com/";
const socket = io(baseurl, { transports: ["websocket"] });

let localStream;
let remoteStream;
let peerConnection;

const localVidBox = document.getElementById("local-video");
const remoteVidBox = document.getElementById("remote-video");

let peerConfiguration = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
};

async function call() {
  try {
    await fetchUserMedia();
    await createPeerConnection();
    // console.log("Creating offer...");
    const offer = await peerConnection.createOffer();
    console.log(offer);
    peerConnection.setLocalDescription(offer);
    didIOffer = true;
    socket.emit('newOffer',offer); //send offer to signalingServer
  } catch (error) {
    console.log(error);
  }
}


const answerOffer = async (offerObj) => {
  await fetchUserMedia();
  await createPeerConnection(offerObj);
  const answer = await peerConnection.createAnswer({}); //just to make the docs happy
  await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
  console.log(offerObj);
  console.log(answer);
  // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
  //add the answer to the offerObj so the server knows which offer this is related to
  offerObj.answer = answer;
  //emit the answer to the signaling server, so it can emit to CLIENT1
  //expect a response from the server with the already existing ICE candidates
  const offerIceCandidates = await socket.emitWithAck("newAnswer", offerObj);
  offerIceCandidates.forEach((c) => {
    peerConnection.addIceCandidate(c);
    console.log("======Added Ice Candidate======");
  });
  console.log(offerIceCandidates);
};

const addAnswer = async (offerObj) => {
  //addAnswer is called in socketListeners when an answerResponse is emitted.
  //at this point, the offer and answer have been exchanged!
  //now CLIENT1 needs to set the remote
  await peerConnection.setRemoteDescription(offerObj.answer);
  // console.log(peerConnection.signalingState)
};

const fetchUserMedia = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        // audio: true,
      });
      localVidBox.srcObject = stream;
      localStream = stream;
      resolve();
    } catch (error) {
      console.log(error);
      reject();
    }
  });
};

const createPeerConnection = (offerObj) => {
  return new Promise(async (resolve, reject) => {
    try {
      peerConnection = new RTCPeerConnection(peerConfiguration);
      remoteStream = new MediaStream();
      remoteVidBox.srcObject = remoteStream;

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnection.addEventListener("signalingstatechange", (event) => {
        // console.log(event);
        // console.log(peerConnection.signalingState);
      });

      peerConnection.addEventListener("icecandidate", (e) => {
        // console.log("........Ice candidate found!......");
        // console.log(e);
        if (e.candidate) {
          socket.emit("sendIceCandidateToSignalingServer", {
            iceCandidate: e.candidate,
            iceUserName: "bhaskar",
            didIOffer,
          });
        }
      });

      peerConnection.addEventListener("track", (e) => {
        console.log("Got a track from the other peer!! Now that's exciting");
        console.log(e);
        e.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track, remoteStream);
          console.log("Here's an exciting moment... fingers cross");
        });
      });

      if (offerObj) {
        //this won't be set when called from call();
        //will be set when we call from answerOffer()
        // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
        await peerConnection.setRemoteDescription(offerObj.offer);
        // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
      }
      resolve();
    } catch (error) {
      console.log(error);
      reject();
    }
  });
};

const addNewIceCandidate = (iceCandidate) => {
  peerConnection.addIceCandidate(iceCandidate);
  console.log("======Added Ice Candidate======");
};

//// socket listeners

//on connection get all available offers and call createOfferEls
socket.on("availableOffers", (offers) => {
  console.log(offers);
  createOfferEls(offers);
});

//someone just made a new offer and we're already here - call createOfferEls
socket.on("newOfferAwaiting", (offers) => {
  createOfferEls(offers);
});

socket.on("answerResponse", (offerObj) => {
  console.log(offerObj);
  addAnswer(offerObj);
});

socket.on("receivedIceCandidateFromServer", (iceCandidate) => {
  addNewIceCandidate(iceCandidate);
  console.log(iceCandidate);
});

function createOfferEls(offers) {
  //make green answer button for this new offer
  const answerEl = document.querySelector("#answer");
  offers.forEach((o) => {
    console.log(o);
    const newOfferEl = document.createElement("div");
    newOfferEl.innerHTML = `<button id="answer-btn">Answer ${o.offererUserName}</button>`;
    newOfferEl.addEventListener("click", () => answerOffer(o));
    answerEl.appendChild(newOfferEl);
  });
}

document.querySelector("#call").addEventListener("click", call);
