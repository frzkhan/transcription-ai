const { createApp } = Vue;

createApp({
  data() {
    return {
      transcriptons: [],
      microphone: undefined,
      socket: new WebSocket("ws://localhost:3000"),
      prompt: null,
      queries: [],
    };
  },
  created() {
    this.socket.addEventListener("open", async () => {
      console.log("WebSocket connection opened");
      this.scrollToBottom("transcript");
      this.scrollToBottom("chat");
    });

    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.channel.alternatives[0].transcript !== "") {
        // extract transcription from words based off speaker

        const transcript = data.channel.alternatives[0].words.reduce(
          (acc, word) => {
            if (acc.length === 0) {
              return [word];
            }

            const lastWord = acc[acc.length - 1];
            if (lastWord.speaker === word.speaker) {
              lastWord.word += ` ${word.word}`;
            } else {
              acc.push(word);
            }

            return acc;
          },
          []
        );

        this.transcriptons.push(transcript);
        this.scrollToBottom("transcript");
      }
    });

    this.socket.addEventListener("close", () => {
      console.log("WebSocket connection closed");
    });
  },
  methods: {
    async getMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        return new MediaRecorder(stream);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        throw error;
      }
    },
    scrollToBottom(id) {
      this.$nextTick(() => {
        const bottom = document.getElementById(id);
        bottom.scrollTop = bottom.scrollHeight;
      });
    },
    async start() {
      if (!this.microphone) {
        try {
          this.microphone = await this.getMicrophone();
          await this.openMicrophone(this.microphone, this.socket);
        } catch (error) {
          console.error("Error opening microphone:", error);
        }
      } else {
        await this.closeMicrophone(this.microphone);
        this.microphone = undefined;
      }
    },
    openMicrophone(microphone, socket) {
      return new Promise((resolve) => {
        microphone.onstart = () => {
          console.log("WebSocket connection opened");
          document.body.classList.add("recording");
          resolve();
        };

        microphone.onstop = () => {
          console.log("WebSocket connection closed");
          document.body.classList.remove("recording");
        };

        microphone.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        microphone.start(1000);
      });
    },
    closeMicrophone(microphone) {
      microphone.stop();
    },
    askAi() {
      if (!this.prompt) {
        return;
      }
      const cleanedWithSpeaker = this.transcriptons
        .map((transcript) => {
          return transcript
            .map((word) => {
              return `Person ${word.speaker}: ${word.word}`;
            })
            .join("\n");
        })
        .join("\n");

      fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3.2",
          prompt:
            " answer questions from the provided transcripts only, keep the response short and to the point \n\n" +
            this.prompt +
            " \n\n" +
            cleanedWithSpeaker,
          stream: false,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          this.queries.push({
            prompt: this.prompt,
            response: data.response,
          });
          this.prompt = null;
          console.log("Success:", data);
          this.scrollToBottom("chat");
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    },
  },
}).mount("#app");
