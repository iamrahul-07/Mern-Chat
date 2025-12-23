import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { AuthContext } from "./AuthContext.jsx";
import { toast } from "react-hot-toast";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { socket, axios, authUser } = useContext(AuthContext);

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({});
  const [messageCache, setMessageCache] = useState({});

  // 🔑 Ref to avoid stale socket closures
  const selectedUserRef = useRef(null);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  /* ----------------------------------
     GET USERS
  ---------------------------------- */
  const getUsers = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/messages/users");
      if (data.success) {
        setUsers(data.users);
        setUnseenMessages(data.unseenMessages || {});
      }
    } catch (error) {
      toast.error(error.message);
    }
  }, [axios]);

  /* ----------------------------------
     GET MESSAGES
  ---------------------------------- */
  const getMessages = useCallback(
    async (userId) => {
      try {
        // show cached messages immediately
        if (messageCache[userId]) {
          setMessages(messageCache[userId]);
          setUnseenMessages((prev) => ({ ...prev, [userId]: 0 }));
          return;
        }

        setMessages([]);
        const { data } = await axios.get(`/api/messages/${userId}`);

        if (data.success) {
          const sorted = data.messages.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );

          setMessages(sorted);
          setMessageCache((prev) => ({ ...prev, [userId]: sorted }));
          setUnseenMessages((prev) => ({ ...prev, [userId]: 0 }));
        }
      } catch (error) {
        toast.error(error.message);
      }
    },
    [axios, messageCache]
  );

  /* ----------------------------------
     SEND MESSAGE (OPTIMISTIC)
  ---------------------------------- */
  const sendMessage = useCallback(
    async (messageData) => {
      if (!selectedUser) return;

      const tempId = Date.now().toString();

      const optimisticMessage = {
        _id: tempId,
        sender: authUser._id,
        receiver: selectedUser._id,
        text: messageData.text || "",
        image: messageData.image || "",
        createdAt: new Date().toISOString(),
        seen: false,
        deleted: false,
      };

      // optimistic UI update
      setMessages((prev) => [optimisticMessage, ...prev]);
      setMessageCache((prev) => ({
        ...prev,
        [selectedUser._id]: [
          optimisticMessage,
          ...(prev[selectedUser._id] || []),
        ],
      }));

      try {
        const { data } = await axios.post(
          `/api/messages/send/${selectedUser._id}`,
          messageData
        );

        // replace optimistic message
        setMessages((prev) =>
          prev.map((m) =>
            m._id === tempId
              ? { ...data, createdAt: data.createdAt || optimisticMessage.createdAt }
              : m
          )
        );

        setMessageCache((prev) => ({
          ...prev,
          [selectedUser._id]: prev[selectedUser._id].map((m) =>
            m._id === tempId
              ? { ...data, createdAt: data.createdAt || optimisticMessage.createdAt }
              : m
          ),
        }));
      } catch (error) {
        // rollback on failure
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        setMessageCache((prev) => ({
          ...prev,
          [selectedUser._id]: prev[selectedUser._id].filter(
            (m) => m._id !== tempId
          ),
        }));

        toast.error(
          error.response?.data?.message || "Failed to send message"
        );
      }
    },
    [axios, selectedUser, authUser]
  );

  /* ----------------------------------
     DELETE MESSAGE
  ---------------------------------- */
  const deleteMessage = useCallback(
    async (messageId) => {
      try {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === messageId
              ? { ...m, deleted: true, text: "This message was deleted", image: "" }
              : m
          )
        );

        setMessageCache((prev) => {
          const updated = { ...prev };
          if (selectedUser && updated[selectedUser._id]) {
            updated[selectedUser._id] = updated[selectedUser._id].map((m) =>
              m._id === messageId
                ? { ...m, deleted: true, text: "This message was deleted", image: "" }
                : m
            );
          }
          return updated;
        });

        await axios.delete(`/api/messages/${messageId}`);
      } catch (error) {
        toast.error("Failed to delete message");
      }
    },
    [axios, selectedUser]
  );

  /* ----------------------------------
     SOCKET: REAL-TIME MESSAGES (🔥 FIX)
  ---------------------------------- */
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage) => {
      const currentUser = selectedUserRef.current;

      // update sidebar ordering
      setUsers((prev) =>
        prev.map((u) =>
          u._id === newMessage.sender || u._id === newMessage.receiver
            ? { ...u, lastMessageAt: newMessage.createdAt }
            : u
        )
      );

      if (
        currentUser &&
        (newMessage.sender === currentUser._id ||
          newMessage.receiver === currentUser._id)
      ) {
        setMessages((prev) => [newMessage, ...prev]);
        setMessageCache((prev) => ({
          ...prev,
          [currentUser._id]: [
            newMessage,
            ...(prev[currentUser._id] || []),
          ],
        }));

        axios.put(`/api/messages/mark/${newMessage._id}`);
        setUnseenMessages((prev) => ({ ...prev, [currentUser._id]: 0 }));
      } else {
        setUnseenMessages((prev) => ({
          ...prev,
          [newMessage.sender]: (prev[newMessage.sender] || 0) + 1,
        }));
      }
    };

    const handleDelete = (deletedMsg) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === deletedMsg._id ? deletedMsg : m))
      );
    };

    socket.on("newMessage", handleNewMessage);
    socket.on("messageDeleted", handleDelete);

    return () => {
      socket.off("newMessage", handleNewMessage);
      socket.off("messageDeleted", handleDelete);
    };
  }, [socket, axios]);

  /* ----------------------------------
     RESET WHEN NO USER SELECTED
  ---------------------------------- */
  useEffect(() => {
    if (!selectedUser) setMessages([]);
  }, [selectedUser]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        users,
        selectedUser,
        setSelectedUser,
        unseenMessages,
        getUsers,
        getMessages,
        sendMessage,
        deleteMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
