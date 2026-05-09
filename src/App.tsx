function App() {
  const handleClick = () => {
    const result = window.api.test();
    console.log(result);
    alert(result);
  };

  return (
    <div>
      <h1>Electron Template</h1>
      <button onClick={handleClick}>API Test</button>
    </div>
  );
}

export default App;